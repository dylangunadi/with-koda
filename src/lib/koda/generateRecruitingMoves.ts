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

export function generateMockMoves(profile: Profile): GeneratedMove[] {
  const role = (profile.target_roles ?? [])[0] || "Software Engineer";
  const company = (profile.target_companies ?? [])[0] || "a top tech company";
  const secondCompany = (profile.target_companies ?? [])[1] || "a growth-stage startup";

  return [
    {
      title: `Research ${company}'s recent product launches`,
      type: "application_strategy",
      company,
      person: null,
      fit_reason: `Understanding ${company}'s product direction will help you tailor your application and stand out in interviews.`,
      suggested_action: `Spend 30 minutes reading ${company}'s recent blog posts and press releases, then write 3 bullet points on how your skills connect to their current priorities.`,
      outreach_draft: "",
      proof_of_work_idea: `Write a one-page analysis of ${company}'s latest product feature and how you would improve it, using your ${role} perspective.`,
      follow_up_timing: "Complete within 2 days",
      source_note: "Starting with research on your top target company.",
      confidence: 0.85,
    },
    {
      title: `Connect with a ${role} at ${secondCompany}`,
      type: "person_to_contact",
      company: secondCompany,
      person: `a mid-level ${role} who joined within the last 2 years`,
      fit_reason: `Recent hires at ${secondCompany} understand the current hiring bar and can share what actually mattered in their process.`,
      suggested_action: `Find this person on LinkedIn and send a brief, specific connection request mentioning a shared interest or background.`,
      outreach_draft: `Hi, I'm ${profile.name || "a student"} at ${profile.school || "university"} exploring ${role} roles. Your path into ${secondCompany} caught my eye because it seems closely aligned with what I'm building toward. Would you be open to a 15 minute chat sometime this week?`,
      proof_of_work_idea: "",
      follow_up_timing: "Send by end of this week",
      source_note: "Networking with recent hires is a high-signal recruiting move.",
      confidence: 0.75,
    },
    {
      title: `Build a mini project showcasing ${role} skills`,
      type: "proof_of_work",
      company: null,
      person: null,
      fit_reason: `A tangible artifact demonstrates your skills better than any resume bullet and gives you something concrete to reference in outreach.`,
      suggested_action: `Pick one small project idea and timebox 2 hours to build a working prototype or write-up you can share.`,
      outreach_draft: "",
      proof_of_work_idea: `Create a short case study or prototype relevant to ${role}. For example, if targeting product roles, write a 1-page product tear-down. If targeting engineering, build a small tool or script that solves a real problem you've encountered.`,
      follow_up_timing: "Complete within 3 days",
      source_note: "Proof-of-work artifacts give you something tangible to share in outreach.",
      confidence: 0.8,
    },
  ];
}

export async function generateRecruitingMoves(
  profile: Profile,
  agentContext?: AgentContext
): Promise<GeneratedMove[]> {
  const apiKey = getAnthropicApiKey();

  if (!apiKey) {
    console.warn("[koda:generateMoves] No ANTHROPIC_API_KEY — falling back to mock moves.");
    return generateMockMoves(profile);
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
      console.warn("[koda:generateMoves] LLM returned empty moves array — falling back to mock moves.");
      return generateMockMoves(profile);
    }

    return moves.map((move) => {
      if (isValidMove(move)) {
        return move;
      }
      return sanitizeMove(move as Record<string, unknown>);
    });
  } catch {
    console.warn("[koda:generateMoves] Failed to parse LLM response — falling back to mock moves.");
    return generateMockMoves(profile);
  }
}
