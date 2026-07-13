import type { AgentContext, EffortBucket, MoveSourceStatus, MoveType, OnboardingExtracted, Profile } from "@/lib/types";
import { getAnthropicApiKey } from "@/lib/env";

export interface GeneratedMove {
  title: string;
  type: MoveType;
  company: string | null;
  person: string | null;
  fit_reason: string;
  suggested_action: string;
  outreach_draft: string;
  proof_of_work_idea: string;
  follow_up_timing: string;
  source_note: string;
  confidence: number;
  priority: string;
  effort: string;
  effort_bucket: EffortBucket;
  expected_outcome: string;
  source_status: MoveSourceStatus;
  /** Ref id ("EV1", "OP2") of the verified external item this move is built
   * on; resolved and enforced server-side in grounding.ts. */
  source_ref: string | null;
}

export interface OnboardingTurnInput {
  extracted: OnboardingExtracted;
  missing: (keyof OnboardingExtracted)[];
  history: { role: "user" | "koda"; content: string }[];
  userMessage: string;
  /** Called with reply-text fragments as they become available, so the UI can
   * render (and speak) the response before the turn completes. Optional: the
   * full reply is always returned in the result regardless. */
  onDelta?: (text: string) => void;
}

export interface OnboardingTurnResult {
  reply: string;
  extracted: Partial<OnboardingExtracted>;
}

export type AiMode = "live" | "mock";

export type OngoingIntent = "add_context" | "update_profile" | "ask_next_move" | "chat";

export interface ProposedRelationship {
  person_name: string;
  organization: string | null;
  role_title: string | null;
  context: string | null;
  interaction_date: string | null;
  follow_up_date: string | null;
}

/** Whitelisted profile fields the conversation may propose to change. */
export const UPDATABLE_PROFILE_FIELDS = [
  "target_roles",
  "target_companies",
  "locations",
  "recruiting_stage",
  "timeline",
  "work_auth",
  "success_definition",
] as const;
export type UpdatableProfileField = (typeof UPDATABLE_PROFILE_FIELDS)[number];

export interface ProfileDiffEntry {
  field: UpdatableProfileField;
  new_value: string | string[];
  /** Filled server-side from the actual profile; never model-asserted. */
  old_value?: string | string[] | null;
}

export interface OngoingProposal {
  relationships?: ProposedRelationship[];
  profile_diff?: ProfileDiffEntry[];
}

export interface OngoingGrounding {
  recentMoves: { title: string; type: string; status: string; company: string | null; confidence: number }[];
  relationships: {
    person_name: string;
    organization: string | null;
    context: string | null;
    follow_up_date: string | null;
  }[];
}

export interface OngoingTurnInput {
  profile: Profile;
  userMessage: string;
  history: { role: "user" | "koda"; content: string }[];
  grounding: OngoingGrounding;
  /** Streaming reply fragments; see OnboardingTurnInput.onDelta. */
  onDelta?: (text: string) => void;
}

export interface OngoingTurnResult {
  reply: string;
  intent: OngoingIntent;
  proposal?: OngoingProposal;
}

export interface KodaAI {
  mode: AiMode;
  onboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult>;
  ongoingTurn(input: OngoingTurnInput): Promise<OngoingTurnResult>;
  generateMoves(profile: Profile, agentContext?: AgentContext): Promise<GeneratedMove[]>;
}

/**
 * True when the deterministic offline provider should be used: either
 * explicitly requested (KODA_AI_MOCK=1) or no Anthropic key is configured.
 * The mock is always labeled in its output; it is a documented fallback,
 * never a disguise for the live model.
 */
export function isMockMode(): boolean {
  return process.env.KODA_AI_MOCK === "1" || !getAnthropicApiKey();
}

/**
 * Test-only failure injection: honored exclusively in mock mode outside
 * production, so the real AI error paths can be exercised in browser tests.
 * It can only cause failures, never fabricate success.
 */
export function isForcedFailure(headers: Headers): boolean {
  return (
    process.env.KODA_AI_MOCK === "1" &&
    process.env.NODE_ENV !== "production" &&
    headers.get("x-koda-test-ai") === "fail"
  );
}

export class KodaAiError extends Error {
  retryable = true;
}

export async function getKodaAI(): Promise<KodaAI> {
  if (isMockMode()) {
    const { mockProvider } = await import("./mock");
    return mockProvider;
  }
  const { anthropicProvider } = await import("./anthropic");
  return anthropicProvider;
}
