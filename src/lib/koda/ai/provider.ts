import type { AgentContext, MoveSourceStatus, MoveType, OnboardingExtracted, Profile } from "@/lib/types";
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
  expected_outcome: string;
  source_status: MoveSourceStatus;
}

export interface OnboardingTurnInput {
  extracted: OnboardingExtracted;
  missing: (keyof OnboardingExtracted)[];
  history: { role: "user" | "koda"; content: string }[];
  userMessage: string;
}

export interface OnboardingTurnResult {
  reply: string;
  extracted: Partial<OnboardingExtracted>;
}

export type AiMode = "live" | "mock";

export interface KodaAI {
  mode: AiMode;
  onboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult>;
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
