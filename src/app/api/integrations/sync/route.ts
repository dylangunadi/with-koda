import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isForcedIntegrationFailure } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { runIntegrationSync } from "@/lib/koda/integrations/sync";
import { logKodaEvent } from "@/lib/koda/events";
import type { Integration } from "@/lib/types";

/** Manual "Sync now", rate-limited like /api/moves/generate. */
const RATE_LIMIT_MINUTES = 2;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider: string;
  try {
    const body = await request.json();
    provider = body.provider;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (provider !== "google_calendar" && provider !== "job_boards") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", provider)
    .maybeSingle();

  if (!integration) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60_000).toISOString();
  const { data: recentRuns } = await supabase
    .from("integration_sync_runs")
    .select("id")
    .eq("integration_id", integration.id)
    .eq("trigger", "manual")
    .gte("started_at", cutoff)
    .limit(1);

  if (recentRuns && recentRuns.length > 0) {
    return NextResponse.json(
      { error: "Synced very recently. Try again in a couple of minutes." },
      { status: 429 }
    );
  }

  const service = createServiceClient();
  const outcome = await runIntegrationSync(service, integration as Integration, "manual", {
    forceFail: isForcedIntegrationFailure(request.headers),
  });

  if (!outcome.ok) {
    logKodaEvent(supabase, user.id, "integration_sync_failed", {
      provider,
      reconnect_required: outcome.reconnectRequired,
    });
    return NextResponse.json(
      { error: "Sync failed", reconnectRequired: outcome.reconnectRequired },
      { status: 502 }
    );
  }

  logKodaEvent(supabase, user.id, "integration_synced", { provider, trigger: "manual" });
  return NextResponse.json({ ok: true, stats: outcome.stats });
}
