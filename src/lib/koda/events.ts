import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lightweight internal product event log (koda_events table).
 *
 * PRIVACY RULE — properties may contain ONLY ids, enums, booleans, counts,
 * and durations. Never message text, resume content, transcripts, contact
 * names or details, relationship notes, work authorization values, or
 * outreach drafts. The instrumentation spec scans stored properties for
 * leaked test strings; keep it that way.
 *
 * Fire-and-forget: logging must never break a product flow.
 */
export type KodaEventName =
  | "onboarding_started"
  | "onboarding_message_submitted"
  | "onboarding_resumed"
  | "onboarding_completed"
  | "profile_review_edited"
  | "brief_preference_set"
  | "first_brief_generation_started"
  | "first_brief_generated"
  | "first_brief_generation_failed"
  | "voice_input_used"
  | "voice_permission_denied"
  | "turn_latency"
  | "ai_error"
  | "move_edited"
  | "move_accepted"
  | "move_rejected"
  | "move_saved"
  | "move_completed"
  | "talk_to_koda_reopened"
  | "context_added"
  | "context_declined"
  | "profile_update_proposed"
  | "profile_updated"
  | "next_move_requested"
  | "scheduled_brief_enabled"
  | "scheduled_brief_disabled"
  | "scheduled_brief_generated"
  | "scheduled_brief_failed";

export function logKodaEvent(
  supabase: SupabaseClient,
  userId: string,
  eventName: KodaEventName,
  properties: Record<string, string | number | boolean | null> = {}
): void {
  void supabase
    .from("koda_events")
    .insert({ user_id: userId, event_name: eventName, properties })
    .then(({ error }) => {
      if (error) console.warn(`koda_event ${eventName} failed:`, error.message);
    });
}
