import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateRecruitingMoves } from "@/lib/koda/generateRecruitingMoves";
import { buildAgentContext } from "@/lib/koda/agentContext";
import { insertBriefWithMoves } from "@/lib/koda/briefs";
import type { Profile } from "@/lib/types";

const RATE_LIMIT_MINUTES = 2;

export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: check if moves were generated in the last N minutes
  const cutoff = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000).toISOString();
  const { data: recentMoves } = await supabase
    .from("recruiting_moves")
    .select("id")
    .eq("user_id", user.id)
    .gte("created_at", cutoff)
    .limit(1);

  if (recentMoves && recentMoves.length > 0) {
    return NextResponse.json(
      { error: `Please wait at least ${RATE_LIMIT_MINUTES} minutes between generations.` },
      { status: 429 }
    );
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
  let moves;
  try {
    const agentContext = await buildAgentContext(supabase, user.id);
    moves = await generateRecruitingMoves(profile as Profile, agentContext);
  } catch (err) {
    console.error("Move generation failed:", err);
    return NextResponse.json(
      { error: "Failed to generate moves. Please try again." },
      { status: 500 }
    );
  }

  try {
    const { moves: createdMoves } = await insertBriefWithMoves(
      supabase,
      user.id,
      "manual",
      moves
    );
    return NextResponse.json({ moves: createdMoves });
  } catch (err) {
    console.error("Failed to save moves:", err);
    return NextResponse.json({ error: "Failed to save moves" }, { status: 500 });
  }
}
