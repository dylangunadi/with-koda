"use server";

import { createClient } from "@/lib/supabase/server";
import { getKodaAI } from "@/lib/koda/ai/provider";
import { buildAgentContext } from "@/lib/koda/agentContext";
import { insertBriefWithMoves } from "@/lib/koda/briefs";
import { logKodaEvent } from "@/lib/koda/events";
import { profileColumns, type EditableProfile } from "@/lib/koda/profileFields";
import type { Brief, Profile } from "@/lib/types";

export interface ReviewedProfile extends EditableProfile {
  brief_frequency: "manual" | "weekly" | "daily";
  /** Whether the user changed any prefilled field on the review screen. */
  review_edited?: boolean;
}

export interface ConfirmResult {
  success: boolean;
  briefId?: string;
  briefError?: string;
  error?: string;
}

/**
 * Complete conversational onboarding: persist the reviewed profile, close the
 * conversation, and generate the first brief.
 *
 * Idempotent: if the user already has a profile and an onboarding brief,
 * a second confirm returns the existing brief instead of duplicating.
 * If brief generation fails, the profile is still saved and the client is
 * told to offer a retry; nothing the user entered is lost.
 */
export async function confirmOnboarding(review: ReviewedProfile): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: "Not authenticated" };
  }

  const columns = profileColumns(review);
  if (!columns.name) {
    return { success: false, error: "Name is required" };
  }

  // Idempotency guard: a second confirm (double click, refresh replay) must
  // not create a second profile or a second onboarding brief.
  const { data: existingBrief } = await supabase
    .from("briefs")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "onboarding")
    .maybeSingle();
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingBrief && existingProfile) {
    return { success: true, briefId: (existingBrief as Brief).id };
  }

  const frequency = ["manual", "weekly", "daily"].includes(review.brief_frequency)
    ? review.brief_frequency
    : "manual";

  const profileRow = {
    user_id: user.id,
    ...columns,
    // Daily/Weekly chosen at review consents to in-app scheduled briefs
    // (autonomous_enabled). brief_confirmed stays false: that flag belongs to
    // the email double-opt-in flow and is only set by /api/briefs/confirm.
    brief_frequency: frequency,
    autonomous_enabled: frequency !== "manual",
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(profileRow, { onConflict: "user_id" });
  if (profileError) {
    console.error("Profile save failed:", profileError);
    return { success: false, error: "Could not save your profile. Try again." };
  }

  // Close the active onboarding conversation (best effort; the profile row is
  // the authoritative "onboarded" signal).
  await supabase
    .from("koda_conversations")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("kind", "onboarding")
    .eq("status", "active");

  logKodaEvent(supabase, user.id, "onboarding_completed");
  logKodaEvent(supabase, user.id, "brief_preference_set", { frequency });
  if (review.review_edited) {
    logKodaEvent(supabase, user.id, "profile_review_edited");
  }

  // First brief. A failure here must not undo onboarding: report it and let
  // the user retry from the inbox.
  logKodaEvent(supabase, user.id, "first_brief_generation_started");
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();
    const ai = await getKodaAI();
    const agentContext = await buildAgentContext(supabase, user.id);
    const generated = await ai.generateMoves(profile as Profile, agentContext);
    const { brief } = await insertBriefWithMoves(supabase, user.id, "onboarding", generated, {
      ai_mode: ai.mode,
    });
    logKodaEvent(supabase, user.id, "first_brief_generated", { ai_mode: ai.mode });
    return { success: true, briefId: brief.id };
  } catch (err) {
    // A concurrent confirm may have won the onboarding-brief unique index;
    // that is success, not failure — return the existing brief.
    if (err instanceof Error && /23505|duplicate key/.test(err.message)) {
      const { data: racedBrief } = await supabase
        .from("briefs")
        .select("id")
        .eq("user_id", user.id)
        .eq("source", "onboarding")
        .maybeSingle();
      if (racedBrief) {
        return { success: true, briefId: (racedBrief as Brief).id };
      }
    }
    console.error("First brief generation failed:", err);
    logKodaEvent(supabase, user.id, "first_brief_generation_failed");
    return {
      success: true,
      briefError: "Your profile is saved, but the first brief failed. Generate it from your inbox.",
    };
  }
}
