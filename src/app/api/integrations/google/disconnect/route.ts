import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/koda/integrations/google/oauth";
import { isIntegrationsMockMode } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { readRefreshToken } from "@/lib/koda/integrations/tokens";
import { logKodaEvent } from "@/lib/koda/events";

/**
 * Disconnect Google Calendar. This IS the data-deletion promise: revoke at
 * Google (best-effort), then delete the integrations row — the cascade
 * removes tokens, sync runs, and every imported event. Moves the user
 * already received keep their copied source_url as personal history; the
 * external_event link nulls out.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "google_calendar")
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
  // sync runs, and imported external_events in the same statement.
  const { error } = await supabase.from("integrations").delete().eq("id", integration.id);
  if (error) {
    return NextResponse.json({ error: "Disconnect failed" }, { status: 500 });
  }

  logKodaEvent(supabase, user.id, "integration_disconnected", { provider: "google_calendar" });
  return NextResponse.json({ ok: true });
}
