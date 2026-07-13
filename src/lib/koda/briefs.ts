import type { SupabaseClient } from "@supabase/supabase-js";
import type { Brief, RecruitingMove } from "@/lib/types";
import type { GroundedMove } from "@/lib/koda/grounding";

/**
 * Persist a brief and its generated moves as one unit.
 * Onboarding and manual generation go through here; the scheduled cron path
 * still writes bare moves and is migrated separately.
 */
export async function insertBriefWithMoves(
  supabase: SupabaseClient,
  userId: string,
  source: Brief["source"],
  generated: GroundedMove[],
  metadata: Record<string, unknown> = {}
): Promise<{ brief: Brief; moves: RecruitingMove[] }> {
  const { data: brief, error: briefError } = await supabase
    .from("briefs")
    .insert({ user_id: userId, source })
    .select()
    .single();

  if (briefError || !brief) {
    throw new Error(`Failed to create brief: ${briefError?.message ?? "no row"}`);
  }

  const movesToInsert = generated.map((move) => ({
    user_id: userId,
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

  if (insertError || !createdMoves) {
    throw new Error(`Failed to save moves: ${insertError?.message ?? "no rows"}`);
  }

  const events = createdMoves.map((move) => ({
    move_id: move.id,
    user_id: userId,
    event_type: "generated" as const,
    metadata: { ...metadata, brief_id: brief.id, source },
  }));

  const { error: eventsError } = await supabase.from("move_events").insert(events);
  if (eventsError) {
    // Non-fatal: moves were created, events are supplementary.
    console.error("Failed to insert move events:", eventsError);
  }

  return { brief: brief as Brief, moves: createdMoves as RecruitingMove[] };
}
