import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/koda/integrations/google/oauth";
import { isIntegrationsMockMode } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { readRefreshToken } from "@/lib/koda/integrations/tokens";
import { logKodaEvent } from "@/lib/koda/events";

/**
 * Disconnect a Google integration (Calendar or Gmail). This IS the
 * data-deletion promise: revoke at Google (best-effort), then delete the
 * integrations row — the cascade removes tokens, sync runs, and every
 * imported event or thread. Moves the user already received keep their
 * copied source_url as personal history; the external link nulls out.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider = "google_calendar";
  try {
    const body = await request.json();
    if (body?.provider) provider = body.provider;
  } catch {
    // No body: default provider keeps the original calendar-only contract.
  }
  if (provider !== "google_calendar" && provider !== "gmail") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  if (!isIntegrationsMockMode()) {
    const service = createServiceClient();
    const refreshToken = await readRefreshToken(service, integration.id);
    if (refreshToken) {
      await revokeToken(refreshToken);
    }
  }

  // User-client delete: RLS guarantees ownership; FK cascade removes tokens,
  // sync runs, and imported records in the same statement.
  const { error } = await supabase.from("integrations").delete().eq("id", integration.id);
  if (error) {
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }

  logKodaEvent(supabase, user.id, "integration_disconnected", { provider });
  return NextResponse.json({ ok: true });
}
