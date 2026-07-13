import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Integration, JobBoardConfig, Relationship } from "@/lib/types";
import { classifyEvent } from "./classify";
import { getCalendarSource, getOpportunitySource } from "./registry";
import { getValidAccessToken } from "./tokens";
import { ReconnectRequiredError, type NormalizedEvent } from "./types";

/**
 * Pull-based sync engine. Claim-first idempotency mirrors the briefs cron:
 * scheduled runs insert an integration_sync_runs row before pulling, and the
 * partial unique index turns a rerun into a clean skip. All writes stay in
 * external_* and bookkeeping tables — no code path from sync to any outbound
 * contact. stats hold counts only (koda_events privacy convention).
 */

const FULL_WINDOW_PAST_DAYS = 7;
const FULL_WINDOW_FUTURE_DAYS = 60;

export type SyncOutcome =
  | { ok: true; skipped?: "already_synced_today"; stats: Record<string, number> }
  | { ok: false; error: string; reconnectRequired: boolean };

export type SyncTrigger = "scheduled" | "manual" | "initial";

async function claimRun(
  service: SupabaseClient,
  integration: Integration,
  trigger: SyncTrigger
): Promise<{ runId: string } | { skipped: true } | { error: string }> {
  const { data, error } = await service
    .from("integration_sync_runs")
    .insert({ integration_id: integration.id, user_id: integration.user_id, trigger })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { skipped: true };
    return { error: `Sync run claim failed: ${error.message}` };
  }
  return { runId: data.id };
}

async function finishRun(
  service: SupabaseClient,
  runId: string,
  outcome: { status: "ok" | "failed"; stats?: Record<string, number>; error?: string }
): Promise<void> {
  await service
    .from("integration_sync_runs")
    .update({
      status: outcome.status,
      stats: outcome.stats ?? {},
      error: outcome.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

async function recordSyncSuccess(
  service: SupabaseClient,
  integrationId: string,
  cursor: string | null | undefined
): Promise<void> {
  const update: Record<string, unknown> = {
    status: "connected",
    last_synced_at: new Date().toISOString(),
    last_sync_error: null,
    updated_at: new Date().toISOString(),
  };
  if (cursor !== undefined) update.sync_cursor = cursor;
  await service.from("integrations").update(update).eq("id", integrationId);
}

async function recordSyncFailure(
  service: SupabaseClient,
  integrationId: string,
  message: string
): Promise<void> {
  await service
    .from("integrations")
    .update({ last_sync_error: message.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", integrationId);
}

/** Match attendees to the user's confirmed relationship memory by name. Never
 * creates a relationship — only links to ones the user already confirmed. */
function matchRelationship(
  event: NormalizedEvent,
  relationships: Relationship[]
): string | null {
  for (const attendee of event.attendees) {
    if (!attendee.name) continue;
    const name = attendee.name.trim().toLowerCase();
    const match = relationships.find((r) => r.person_name.trim().toLowerCase() === name);
    if (match) return match.id;
  }
  return null;
}

export async function runCalendarSync(
  service: SupabaseClient,
  integration: Integration,
  trigger: SyncTrigger,
  options: { forceFail?: boolean } = {}
): Promise<SyncOutcome> {
  const claim = await claimRun(service, integration, trigger);
  if ("skipped" in claim) return { ok: true, skipped: "already_synced_today", stats: {} };
  if ("error" in claim) return { ok: false, error: claim.error, reconnectRequired: false };

  try {
    if (options.forceFail) {
      throw new Error("forced_test_failure");
    }

    const accessToken = await getValidAccessToken(service, integration.id);
    const source = await getCalendarSource();
    const now = Date.now();
    const result = await source.pullEvents({
      accessToken,
      cursor: integration.sync_cursor,
      windowStart: new Date(now - FULL_WINDOW_PAST_DAYS * 86_400_000).toISOString(),
      windowEnd: new Date(now + FULL_WINDOW_FUTURE_DAYS * 86_400_000).toISOString(),
    });

    const { data: relationshipRows } = await service
      .from("relationships")
      .select("*")
      .eq("user_id", integration.user_id)
      .limit(100);
    const relationships = (relationshipRows ?? []) as Relationship[];

    const fetchedAt = new Date().toISOString();
    let upserted = 0;
    for (const event of result.events) {
      const row = {
        user_id: integration.user_id,
        integration_id: integration.id,
        provider: "google_calendar",
        external_id: event.external_id,
        title: event.title,
        description_snippet: event.description_snippet,
        start_at: event.start_at,
        end_at: event.end_at,
        location: event.location,
        attendees: event.attendees,
        organizer_email: event.organizer_email,
        html_link: event.html_link,
        event_status: event.event_status,
        classification: classifyEvent(event),
        relationship_id: matchRelationship(event, relationships),
        source_updated_at: event.source_updated_at,
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      };
      const { error } = await service
        .from("external_events")
        .upsert(row, { onConflict: "user_id,provider,external_id" });
      if (error) {
        throw new Error(`Event upsert failed: ${error.message}`);
      }
      upserted += 1;
    }

    const stats = {
      fetched: result.events.length,
      upserted,
      full_resync: result.fullResync ? 1 : 0,
    };
    await finishRun(service, claim.runId, { status: "ok", stats });
    await recordSyncSuccess(service, integration.id, result.nextCursor);
    return { ok: true, stats };
  } catch (err) {
    const reconnectRequired = err instanceof ReconnectRequiredError;
    const message = err instanceof Error ? err.message : "Unknown sync error";
    await finishRun(service, claim.runId, { status: "failed", error: message });
    // ReconnectRequiredError already set status='error' via markNeedsReconnect.
    if (!reconnectRequired) {
      await recordSyncFailure(service, integration.id, message);
    }
    return { ok: false, error: message, reconnectRequired };
  }
}

export async function runJobBoardsSync(
  service: SupabaseClient,
  integration: Integration,
  trigger: SyncTrigger,
  options: { forceFail?: boolean } = {}
): Promise<SyncOutcome> {
  const claim = await claimRun(service, integration, trigger);
  if ("skipped" in claim) return { ok: true, skipped: "already_synced_today", stats: {} };
  if ("error" in claim) return { ok: false, error: claim.error, reconnectRequired: false };

  const boards: JobBoardConfig[] = integration.config.boards ?? [];

  try {
    if (options.forceFail) {
      throw new Error("forced_test_failure");
    }

    let fetched = 0;
    let upserted = 0;
    let closed = 0;

    for (const board of boards) {
      const source = await getOpportunitySource(board.ats);
      const { postings, fetchedAt } = await source.pullPostings({
        boardToken: board.board_token,
        company: board.company,
      });
      fetched += postings.length;

      const liveIds: string[] = [];
      for (const posting of postings) {
        liveIds.push(posting.external_id);
        const { error } = await service.from("external_opportunities").upsert(
          {
            user_id: integration.user_id,
            integration_id: integration.id,
            provider: board.ats,
            board_token: board.board_token,
            external_id: posting.external_id,
            company: posting.company,
            title: posting.title,
            location: posting.location,
            department: posting.department,
            absolute_url: posting.absolute_url,
            source_posted_at: posting.source_posted_at,
            source_updated_at: posting.source_updated_at,
            last_seen_at: fetchedAt,
            fetched_at: fetchedAt,
            verification_status: "verified_live",
            updated_at: fetchedAt,
          },
          { onConflict: "user_id,provider,board_token,external_id" }
        );
        if (error) {
          throw new Error(`Opportunity upsert failed: ${error.message}`);
        }
        upserted += 1;
      }

      // Postings that were live on this board but absent from this fetch are
      // no longer listed: mark closed (honest label, no silent deletion).
      let closeQuery = service
        .from("external_opportunities")
        .update({ verification_status: "closed", updated_at: fetchedAt }, { count: "exact" })
        .eq("user_id", integration.user_id)
        .eq("provider", board.ats)
        .eq("board_token", board.board_token)
        .eq("verification_status", "verified_live");
      if (liveIds.length > 0) {
        closeQuery = closeQuery.not(
          "external_id",
          "in",
          `(${liveIds.map((id) => `"${id}"`).join(",")})`
        );
      }
      const { count, error: closeError } = await closeQuery;
      if (closeError) {
        throw new Error(`Opportunity close pass failed: ${closeError.message}`);
      }
      closed += count ?? 0;
    }

    const stats = { boards: boards.length, fetched, upserted, closed };
    await finishRun(service, claim.runId, { status: "ok", stats });
    await recordSyncSuccess(service, integration.id, undefined);
    return { ok: true, stats };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown sync error";
    await finishRun(service, claim.runId, { status: "failed", error: message });
    await recordSyncFailure(service, integration.id, message);
    return { ok: false, error: message, reconnectRequired: false };
  }
}

/** Dispatch by provider; used by the cron and manual sync routes. */
export async function runIntegrationSync(
  service: SupabaseClient,
  integration: Integration,
  trigger: SyncTrigger,
  options: { forceFail?: boolean } = {}
): Promise<SyncOutcome> {
  if (integration.provider === "google_calendar") {
    return runCalendarSync(service, integration, trigger, options);
  }
  return runJobBoardsSync(service, integration, trigger, options);
}
