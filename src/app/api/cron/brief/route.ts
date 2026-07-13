import { NextRequest, NextResponse } from "next/server";
import { getCronSecret } from "@/lib/env";
import { enforceVerifiedIntegrity } from "@/lib/koda/grounding";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { generateRecruitingMoves } from "@/lib/koda/generateRecruitingMoves";
import { buildAgentContext } from "@/lib/koda/agentContext";
import { sendBriefEmail } from "@/lib/koda/email";
import { logKodaEvent } from "@/lib/koda/events";
import type { Profile } from "@/lib/types";

/**
 * Cron endpoint for scheduled Koda briefs.
 * Called by Vercel Cron on schedule. Protected by CRON_SECRET.
 *
 * Consent model:
 * - Generating an in-app scheduled brief requires autonomous_enabled plus a
 *   daily/weekly frequency (chosen in onboarding review or settings).
 * - Sending the email digest additionally requires brief_email AND
 *   brief_confirmed (the email double-opt-in flow).
 *
 * Idempotent per day: a partial unique index on briefs
 * (user_id, brief_date where source='scheduled') means a rerun cannot create
 * a second brief for the same user and day.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role client to bypass RLS
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.json(
      { error: "Missing Supabase service config" },
      { status: 500 }
    );
  }

  // Users who consented to scheduled briefs (manual users are excluded even
  // if flags drift).
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("autonomous_enabled", true)
    .in("brief_frequency", ["daily", "weekly"]);

  if (profilesError) {
    console.error("[cron:brief] Failed to fetch profiles:", profilesError);
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
      { status: 500 }
    );
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ processed: 0, message: "No users with scheduled briefs enabled" });
  }

  const results: Array<{ userId: string; success: boolean; skipped?: string; error?: string }> = [];

  // Check if today is Monday for weekly users
  const today = new Date();
  const isMonday = today.getUTCDay() === 1;

  for (const profile of profiles as Profile[]) {
    try {
      // Skip weekly users unless it's Monday
      if (profile.brief_frequency === "weekly" && !isMonday) {
        continue;
      }

      // Claim today's scheduled brief BEFORE generating: the unique index
      // makes a rerun (or a concurrent run) a clean skip, never a duplicate.
      const { data: brief, error: claimError } = await supabase
        .from("briefs")
        .insert({ user_id: profile.user_id, source: "scheduled" })
        .select()
        .single();

      if (claimError) {
        if (claimError.code === "23505") {
          results.push({ userId: profile.user_id, success: true, skipped: "already_generated_today" });
          continue;
        }
        throw new Error(`Brief claim failed: ${claimError.message}`);
      }

      let moves;
      try {
        const agentContext = await buildAgentContext(supabase, profile.user_id);
        moves = await generateRecruitingMoves(profile, agentContext);
      } catch (generateError) {
        // Release the claim so the next run can retry instead of leaving an
        // empty phantom brief.
        await supabase.from("briefs").delete().eq("id", brief.id);
        throw generateError;
      }

      const movesToInsert = moves.map(enforceVerifiedIntegrity).map((move) => ({
        user_id: profile.user_id,
        brief_id: brief.id,
        title: move.title,
        type: move.type,
        company: move.company,
        person: move.person,
        fit_reason: move.fit_reason,
        suggested_action: move.suggested_action,
        outreach_draft: move.outreach_draft,
        proof_of_work_idea: move.proof_of_work_idea,
        follow_up_timing: move.follow_up_timing,
        source_note: move.source_note,
        confidence: move.confidence,
        priority: move.priority,
        effort: move.effort,
        effort_bucket: move.effort_bucket,
        expected_outcome: move.expected_outcome,
        source_status: move.source_status,
        external_event_id: move.external_event_id ?? null,
        external_opportunity_id: move.external_opportunity_id ?? null,
        source_url: move.source_url ?? null,
        source_fetched_at: move.source_fetched_at ?? null,
        status: "generated" as const,
      }));

      const { data: createdMoves, error: insertError } = await supabase
        .from("recruiting_moves")
        .insert(movesToInsert)
        .select();

      if (insertError) {
        await supabase.from("briefs").delete().eq("id", brief.id);
        throw new Error(`Insert failed: ${insertError.message}`);
      }

      // Insert move events
      if (createdMoves) {
        const events = createdMoves.map((move: { id: string }) => ({
          move_id: move.id,
          user_id: profile.user_id,
          event_type: "generated" as const,
          metadata: { source: "autonomous_brief", brief_id: brief.id },
        }));

        const { error: eventsError } = await supabase.from("move_events").insert(events);
        if (eventsError) {
          console.warn(`[cron:brief] Failed to insert move_events for user ${profile.user_id}:`, eventsError.message);
        }
      }

      // Email digest only with a confirmed address (email double-opt-in).
      if (profile.brief_email && profile.brief_confirmed) {
        const emailResult = await sendBriefEmail({
          to: profile.brief_email,
          userName: profile.name || "there",
          moves,
        });
        if (!emailResult.sent) {
          console.warn(`[cron:brief] Email not delivered for user ${profile.user_id} (method: ${emailResult.method})`);
        }
      }

      logKodaEvent(supabase, profile.user_id, "scheduled_brief_generated", {
        frequency: profile.brief_frequency,
        emailed: Boolean(profile.brief_email && profile.brief_confirmed),
      });
      results.push({ userId: profile.user_id, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cron:brief] Error for user ${profile.user_id}:`, msg);
      logKodaEvent(supabase, profile.user_id, "scheduled_brief_failed");
      results.push({ userId: profile.user_id, success: false, error: msg });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({
    processed: results.length,
    succeeded,
    failed,
    results,
  });
}
