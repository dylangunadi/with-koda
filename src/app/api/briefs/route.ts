import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBriefConfirmationEmail } from "@/lib/koda/email";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { enabled?: boolean; email?: string; frequency?: string };
  if (!body.enabled) {
    const { error } = await supabase.from("profiles").update({
      autonomous_enabled: false,
      brief_confirmed: false,
      brief_confirmation_token: null,
      brief_confirmation_expires_at: null,
      pending_brief_frequency: null,
      pending_brief_email: null,
    }).eq("user_id", user.id);
    return error
      ? NextResponse.json({ error: error.message }, { status: 500 })
      : NextResponse.json({ enabled: false });
  }

  const email = body.email?.trim();
  const frequency = body.frequency;
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid brief email" }, { status: 400 });
  }
  if (frequency !== "daily" && frequency !== "weekly") {
    return NextResponse.json({ error: "Invalid brief frequency" }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const { data: profile, error } = await supabase.from("profiles").update({
    autonomous_enabled: false,
    brief_confirmed: false,
    brief_confirmation_token: token,
    brief_confirmation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    pending_brief_frequency: frequency,
    pending_brief_email: email,
  }).eq("user_id", user.id).select("name").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await sendBriefConfirmationEmail({ to: email, userName: profile.name || "there", token });
  if (!result.sent) {
    return NextResponse.json({ error: "We could not send the confirmation email. Try again shortly." }, { status: 502 });
  }
  return NextResponse.json({ pending: true });
}
