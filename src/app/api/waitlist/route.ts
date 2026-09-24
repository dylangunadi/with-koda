import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimitHash } from "@/lib/koda/rateLimit";

// Per-IP signup limit (fixed window, Supabase-backed via rate_limit_hit).
const IP_LIMIT = 5;
const IP_WINDOW_SECONDS = 60 * 60;
const MAX_FIELD_LENGTH = 200;

const GENERIC_ERROR = "Could not join the waitlist. Try again shortly.";

function field(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_FIELD_LENGTH) : null;
}

/**
 * Client IP as seen by Vercel's edge. Vercel overwrites x-forwarded-for (and
 * sets x-real-ip) with the connecting client's address, so a client cannot
 * spoof it on Vercel. Off Vercel (local dev, another host without a trusted
 * proxy) both headers are client-controlled and this limit is advisory only.
 */
function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  // Fail closed: inserts require the service role (the public key is never a
  // fallback; the table grants nothing to anon), and the rate limiter
  // requires RATE_LIMIT_SECRET.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[waitlist] Missing Supabase service configuration");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }
  const ipHash = rateLimitHash(clientIp(request));
  if (!ipHash) {
    console.error("[waitlist] Missing RATE_LIMIT_SECRET");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const email = field(body.email)?.toLowerCase() ?? null;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: allowed, error: limitError } = await supabase.rpc("rate_limit_hit", {
    p_key: `waitlist:ip:${ipHash}`,
    p_window_seconds: IP_WINDOW_SECONDS,
    p_limit: IP_LIMIT,
  });
  if (limitError) {
    console.error("[waitlist] Rate limit check failed:", limitError.message);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 503 });
  }
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const row = {
    email,
    name: field(body.name),
    school: field(body.school),
    class_year: field(body.classYear),
    recruiting_stage: field(body.recruitingStage),
    source: "website",
    status: "new",
  };

  const { error: insertError } = await supabase.from("waitlist").insert(row);

  if (insertError) {
    // Duplicate email — treat as success
    if (insertError.code === "23505") {
      return NextResponse.json({ success: true, status: "duplicate" });
    }
    console.error("[waitlist] Insert failed:", insertError.message);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  return NextResponse.json({ success: true, status: "created" });
}
