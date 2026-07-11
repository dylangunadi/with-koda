import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRecruitingMoves } from "@/lib/koda/generateRecruitingMoves";
import { buildAgentContext } from "@/lib/koda/agentContext";
import type { Profile } from "@/lib/types";

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: "Complete your profile first" },
      { status: 400 }
    );
  }

  // Build agent context from prior moves and feedback
  const agentContext = await buildAgentContext(supabase, user.id);
  const moves = await generateRecruitingMoves(profile as Profile, agentContext);

  // Insert moves into recruiting_moves table
  const movesToInsert = moves.map((move) => ({
    user_id: user.id,
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
    status: "generated" as const,
  }));

  const { data: createdMoves, error: insertError } = await supabase
    .from("recruiting_moves")
    .insert(movesToInsert)
    .select();

  if (insertError || !createdMoves) {
    return NextResponse.json(
      { error: "Failed to save moves" },
      { status: 500 }
    );
  }

  // Insert move_events for each created move
  const events = createdMoves.map((move) => ({
    move_id: move.id,
    user_id: user.id,
    event_type: "generated" as const,
    metadata: {},
  }));

  const { error: eventsError } = await supabase
    .from("move_events")
    .insert(events);

  if (eventsError) {
    console.error("Failed to insert move events:", eventsError);
    // Non-fatal: moves were created, events are supplementary
  }

  return NextResponse.json({ moves: createdMoves });
}
