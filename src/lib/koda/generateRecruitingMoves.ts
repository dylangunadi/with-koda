import type { Profile, AgentContext } from "@/lib/types";
import { getKodaAI } from "./ai/provider";
import type { GeneratedMove } from "./ai/provider";
import { resolveSourceRefs, type GroundedMove } from "./grounding";

export type { GeneratedMove, GroundedMove };

/**
 * Generate three recruiting moves via the configured provider, then resolve
 * verified-source citations server-side: a valid ref links the move to the
 * real external record; a "verified" claim without one is downgraded. The
 * label is enforced here, not trusted from the model.
 */
export async function generateRecruitingMoves(
  profile: Profile,
  agentContext?: AgentContext
): Promise<GroundedMove[]> {
  const ai = await getKodaAI();
  const generated = await ai.generateMoves(profile, agentContext);
  return resolveSourceRefs(generated, profile, agentContext);
}
