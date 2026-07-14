import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logKodaEvent, type KodaEventName } from "@/lib/koda/events";

// Client-originated product events. Whitelisted names only, and only numeric
// or short-enum properties named below: browsers cannot be trusted with the
// analytics namespace.
const CLIENT_EVENTS: Record<string, string[]> = {
  voice_permission_denied: [],
  // Perceived latency: ms from submit to first visible reply text, and total.
  turn_latency: ["first_delta_ms", "total_ms", "mode"],
  // Which LinkedIn outreach text was copied to the clipboard (enum only).
  linkedin_outreach_copied: ["field"],
};
const ENUM_PROPS: Record<string, string[]> = {
  mode: ["onboarding", "ongoing"],
  field: ["note", "message"],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; properties?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = body.name as KodaEventName;
  const allowedProps = CLIENT_EVENTS[name];
  if (!allowedProps) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }

  const properties: Record<string, number | string> = {};
  if (typeof body.properties === "object" && body.properties !== null) {
    for (const key of allowedProps) {
      const value = (body.properties as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        properties[key] = Math.round(value);
      } else if (typeof value === "string" && ENUM_PROPS[key]?.includes(value)) {
        properties[key] = value;
      }
    }
  }

  logKodaEvent(supabase, user.id, name, properties);
  return NextResponse.json({ ok: true });
}
