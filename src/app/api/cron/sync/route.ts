import { NextRequest, NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { runIntegrationSync } from "@/lib/koda/integrations/sync";
import type { Integration } from "@/lib/types";

/**
 * Cron endpoint for scheduled integration syncs, one hour before the brief
 * cron so scheduled briefs always see fresh data. Protected by CRON_SECRET.
 *
 * Bounded per invocation: stale-first ordering, capped batch; the next run
 * picks up the remainder. Idempotent per day via the partial unique index on
 * integration_sync_runs (claim-first, like the briefs cron). Per-integration
 * failures are recorded and never block other users. Sync only ever writes
 * external_* and bookkeeping rows — no path to outbound contact.
 */

export const maxDuration = 300;

const BATCH_LIMIT = 50;

export async function GET(request: NextRequest) {
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ error: "Missing Supabase service config" }, { status: 500 });
  }

  const { data: integrations, error } = await service
    .from("integrations")
    .select("*")
    .eq("status", "connected")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ error: "Failed to fetch integrations" }, { status: 500 });
  }

  const results: Array<{
    integrationId: string;
    provider: string;
    success: boolean;
    skipped?: string;
    error?: string;
  }> = [];

  for (const integration of (integrations ?? []) as Integration[]) {
    const outcome = await runIntegrationSync(service, integration, "scheduled");
    if (outcome.ok) {
      results.push({
        integrationId: integration.id,
        provider: integration.provider,
        success: true,
        skipped: outcome.skipped,
      });
    } else {
      results.push({
        integrationId: integration.id,
        provider: integration.provider,
        success: false,
        error: outcome.error,
      });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  });
}
