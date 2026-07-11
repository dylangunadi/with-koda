import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      return NextResponse.json({ error: "Database not configured" }, { status: 500 });
    }

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const row = {
      email,
      name: body.name?.trim() || null,
      school: body.school?.trim() || null,
      class_year: body.classYear?.trim() || null,
      recruiting_stage: body.recruitingStage?.trim() || null,
      source: "website",
      status: "new",
    };

    const { error: insertError } = await supabase.from("waitlist").insert(row);

    if (insertError) {
      // Duplicate email — treat as success
      if (insertError.code === "23505") {
        return NextResponse.json({ success: true, status: "duplicate" });
      }
      console.error("[waitlist]", insertError);
      return NextResponse.json({ error: "Failed to join waitlist." }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: "created" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[waitlist]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
