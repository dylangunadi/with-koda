import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import { MOVE_GENERATOR_SYSTEM_PROMPT, buildUserPrompt } from "./prompts";
import type { Profile, MoveType, AgentContext } from "@/lib/types";

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
}

const VALID_TYPES: MoveType[] = [
  "opportunity",
  "person_to_contact",
  "follow_up",
  "proof_of_work",
  "application_strategy",
];

function isValidMove(move: unknown): move is GeneratedMove {
  if (typeof move !== "object" || move === null) return false;
  const m = move as Record<string, unknown>;
  return (
    typeof m.title === "string" &&
    typeof m.type === "string" &&
    VALID_TYPES.includes(m.type as MoveType) &&
    typeof m.fit_reason === "string" &&
    typeof m.suggested_action === "string" &&
    typeof m.outreach_draft === "string" &&
    typeof m.proof_of_work_idea === "string" &&
    typeof m.follow_up_timing === "string" &&
    typeof m.confidence === "number" &&
    m.confidence >= 0 &&
    m.confidence <= 1 &&
    typeof m.source_note === "string"
  );
}

function sanitizeMove(move: Record<string, unknown>): GeneratedMove {
  return {
    title: String(move.title || ""),
    type: VALID_TYPES.includes(move.type as MoveType)
      ? (move.type as MoveType)
      : "opportunity",
    company: move.company ? String(move.company) : null,
    person: move.person ? String(move.person) : null,
    fit_reason: String(move.fit_reason || ""),
    suggested_action: String(move.suggested_action || ""),
    outreach_draft: String(move.outreach_draft || ""),
    proof_of_work_idea: String(move.proof_of_work_idea || ""),
    follow_up_timing: String(move.follow_up_timing || ""),
    source_note: String(move.source_note || ""),
    confidence: Math.min(1, Math.max(0, Number(move.confidence) || 0.5)),
  };
}

export async function generateRecruitingMoves(
  profile: Profile,
  agentContext?: AgentContext
): Promise<GeneratedMove[]> {
  const apiKey = getAnthropicApiKey();

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for move generation");
  }

  const anthropic = new Anthropic({ apiKey });

  const result = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: MOVE_GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(profile, agentContext) }],
  });

  const raw =
    result.content[0]?.type === "text" ? result.content[0].text : "[]";
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  try {
    const parsed = JSON.parse(text);
    const moves: unknown[] = Array.isArray(parsed) ? parsed : [];

    if (moves.length === 0) {
      throw new Error("Move generation returned no results");
    }

    return moves.map((move) => {
      if (isValidMove(move)) {
        return move;
      }
      return sanitizeMove(move as Record<string, unknown>);
    });
  } catch (error) {
    throw error;
  }
}
