import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendBriefConfirmationEmail } from "@/lib/koda/email";
import { logKodaEvent } from "@/lib/koda/events";

/**
 * Manage scheduled-brief settings. Consent model:
 * - In-app scheduled briefs need only in-product consent
 *   (autonomous_enabled + daily/weekly frequency).
 * - The email digest additionally requires the email double-opt-in:
 *   a confirmation link sets brief_confirmed and promotes the pending email.
 * This is the only place brief settings are written; profile saves never
 * touch them.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { enabled?: boolean; email?: string; frequency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.enabled) {
    const { error } = await supabase.from("profiles").update({
      autonomous_enabled: false,
      brief_frequency: "manual",
      brief_email: null,
      brief_confirmed: false,
      brief_confirmation_token: null,
      brief_confirmation_expires_at: null,
      pending_brief_frequency: null,
      pending_brief_email: null,
    }).eq("user_id", user.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    logKodaEvent(supabase, user.id, "scheduled_brief_disabled");
    return NextResponse.json({ enabled: false });
  }

  const frequency = body.frequency;
  if (frequency !== "daily" && frequency !== "weekly") {
    return NextResponse.json({ error: "Invalid brief frequency" }, { status: 400 });
  }
  const email = body.email?.trim() ?? "";

  const { data: current, error: fetchError } = await supabase
    .from("profiles")
    .select("name,brief_email,brief_confirmed")
    .eq("user_id", user.id)
    .single();
  if (fetchError || !current) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // No email requested: in-app scheduled briefs only.
  if (!email) {
    const { error } = await supabase.from("profiles").update({
      autonomous_enabled: true,
      brief_frequency: frequency,
      brief_email: null,
      brief_confirmed: false,
      brief_confirmation_token: null,
      brief_confirmation_expires_at: null,
      pending_brief_frequency: null,
      pending_brief_email: null,
    }).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logKodaEvent(supabase, user.id, "scheduled_brief_enabled", { frequency, email_digest: false });
    return NextResponse.json({ enabled: true, emailDigest: false });
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid brief email" }, { status: 400 });
  }

  // Same already-confirmed address: only the frequency changes; no new opt-in.
  if (current.brief_confirmed && current.brief_email === email) {
    const { error } = await supabase.from("profiles").update({
      autonomous_enabled: true,
      brief_frequency: frequency,
    }).eq("user_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logKodaEvent(supabase, user.id, "scheduled_brief_enabled", { frequency, email_digest: true });
    return NextResponse.json({ enabled: true, emailDigest: true });
  }

  // New or changed address: in-app briefs turn on now; the email digest stays
  // off (brief_email cleared) until the confirmation link is clicked.
  const token = randomBytes(32).toString("hex");
  const { error } = await supabase.from("profiles").update({
    autonomous_enabled: true,
    brief_frequency: frequency,
    brief_email: null,
    brief_confirmed: false,
    brief_confirmation_token: token,
    brief_confirmation_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    pending_brief_frequency: frequency,
    pending_brief_email: email,
  }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await sendBriefConfirmationEmail({ to: email, userName: current.name || "there", token });
  if (!result.sent) {
    return NextResponse.json({ error: "We could not send the confirmation email. Try again shortly." }, { status: 502 });
  }
  logKodaEvent(supabase, user.id, "scheduled_brief_enabled", { frequency, email_digest: "pending_confirmation" });
  return NextResponse.json({ enabled: true, pending: true });
}
