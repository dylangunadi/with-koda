import type { Profile, AgentContext } from "@/lib/types";
import { getKodaAI } from "./ai/provider";
import type { GeneratedMove } from "./ai/provider";

export type { GeneratedMove };

/**
 * Generate three recruiting moves via the configured provider.
 * Uses the live Anthropic provider when ANTHROPIC_API_KEY is set, otherwise
 * the deterministic, clearly-labeled offline provider (see ai/mock.ts).
 */
export async function generateRecruitingMoves(
  profile: Profile,
  agentContext?: AgentContext
): Promise<GeneratedMove[]> {
  const ai = await getKodaAI();
  return ai.generateMoves(profile, agentContext);
}
