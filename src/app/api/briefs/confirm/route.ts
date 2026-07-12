import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAppUrl } from "@/lib/env";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirect = (status: "confirmed" | "invalid") =>
    NextResponse.redirect(new URL(`/settings?brief=${status}`, getAppUrl()));
  if (!token) return redirect("invalid");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return redirect("invalid");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: profile } = await supabase.from("profiles")
    .select("user_id,pending_brief_frequency,pending_brief_email,brief_confirmation_expires_at")
    .eq("brief_confirmation_token", token).maybeSingle();
  if (!profile || !profile.pending_brief_email || !profile.pending_brief_frequency ||
      !profile.brief_confirmation_expires_at || new Date(profile.brief_confirmation_expires_at) <= new Date()) {
    return redirect("invalid");
  }

  const { error } = await supabase.from("profiles").update({
    autonomous_enabled: true,
    brief_confirmed: true,
    brief_frequency: profile.pending_brief_frequency,
    brief_email: profile.pending_brief_email,
    brief_confirmation_token: null,
    brief_confirmation_expires_at: null,
    pending_brief_frequency: null,
    pending_brief_email: null,
  }).eq("user_id", profile.user_id).eq("brief_confirmation_token", token);
  return redirect(error ? "invalid" : "confirmed");
}
