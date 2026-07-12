import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCronSecret } from "@/lib/env";
import { generateRecruitingMoves } from "@/lib/koda/generateRecruitingMoves";
import { buildAgentContext } from "@/lib/koda/agentContext";
import { sendBriefEmail } from "@/lib/koda/email";
import type { Profile } from "@/lib/types";

/**
 * Cron endpoint for autonomous Koda briefs.
 * Called by Vercel Cron on schedule. Protected by CRON_SECRET.
 * Generates moves for confirmed users with autonomous_enabled = true
 * and emails them a digest.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = getCronSecret();
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role client to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: "Missing Supabase service config" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Find all users with autonomous briefs enabled
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("autonomous_enabled", true)
    .eq("brief_confirmed", true);

  if (profilesError) {
    console.error("[cron:brief] Failed to fetch profiles:", profilesError);
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
      { status: 500 }
    );
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ processed: 0, message: "No users with autonomous briefs enabled" });
  }

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  // Check if today is Monday for weekly users
  const today = new Date();
  const isMonday = today.getUTCDay() === 1;

  for (const profile of profiles as Profile[]) {
    try {
      // Skip weekly users unless it's Monday
      if (profile.brief_frequency === "weekly" && !isMonday) {
        continue;
      }

      // Build agent context for this user
      const agentContext = await buildAgentContext(supabase, profile.user_id);

      // Generate moves
      const moves = await generateRecruitingMoves(profile, agentContext);

      // Insert moves into DB
      const movesToInsert = moves.map((move) => ({
        user_id: profile.user_id,
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

      if (insertError) {
        throw new Error(`Insert failed: ${insertError.message}`);
      }

      // Insert move events
      if (createdMoves) {
        const events = createdMoves.map((move: { id: string }) => ({
          move_id: move.id,
          user_id: profile.user_id,
          event_type: "generated" as const,
          metadata: { source: "autonomous_brief" },
        }));

        const { error: eventsError } = await supabase.from("move_events").insert(events);
        if (eventsError) {
          console.warn(`[cron:brief] Failed to insert move_events for user ${profile.user_id}:`, eventsError.message);
        }
      }

      // Send email digest if user has an email set
      if (profile.brief_email) {
        const emailResult = await sendBriefEmail({
          to: profile.brief_email,
          userName: profile.name || "there",
          moves,
        });
        if (!emailResult.sent) {
          console.warn(`[cron:brief] Email not delivered for user ${profile.user_id} (method: ${emailResult.method})`);
        }
      }

      results.push({ userId: profile.user_id, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`[cron:brief] Error for user ${profile.user_id}:`, msg);
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
