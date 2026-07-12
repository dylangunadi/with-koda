import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import {
  MOVE_GENERATOR_SYSTEM_PROMPT,
  ONBOARDING_TURN_SYSTEM_PROMPT,
  buildOnboardingTurnPrompt,
  buildUserPrompt,
} from "@/lib/koda/prompts";
import type { AgentContext, MoveSourceStatus, MoveType, OnboardingExtracted, Profile } from "@/lib/types";
import type { GeneratedMove, KodaAI, OnboardingTurnInput, OnboardingTurnResult } from "./provider";
import { KodaAiError } from "./provider";

const MODEL = "claude-sonnet-4-5";

const VALID_TYPES: MoveType[] = [
  "opportunity",
  "person_to_contact",
  "follow_up",
  "proof_of_work",
  "application_strategy",
];

const VALID_SOURCE_STATUSES: MoveSourceStatus[] = ["user_provided", "inferred", "ai_suggested"];

function client(): Anthropic {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new KodaAiError("ANTHROPIC_API_KEY is required for the live provider");
  }
  return new Anthropic({ apiKey });
}

/** Strip optional markdown fences and parse. Only the parsed JSON is ever used;
 *  raw model output (including any preamble) never reaches the client. */
function parseJson(raw: string): unknown {
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(text);
  } catch {
    // last resort: parse from the first JSON opener
    const start = text.search(/[[{]/);
    if (start >= 0) {
      try {
        return JSON.parse(text.slice(start));
      } catch {
        /* fall through */
      }
    }
    throw new KodaAiError("Model returned unparseable output");
  }
}

function sanitizeMove(move: Record<string, unknown>): GeneratedMove {
  return {
    title: String(move.title || ""),
    type: VALID_TYPES.includes(move.type as MoveType) ? (move.type as MoveType) : "opportunity",
    company: move.company ? String(move.company) : null,
    person: move.person ? String(move.person) : null,
    fit_reason: String(move.fit_reason || ""),
    suggested_action: String(move.suggested_action || ""),
    outreach_draft: String(move.outreach_draft || ""),
    proof_of_work_idea: String(move.proof_of_work_idea || ""),
    follow_up_timing: String(move.follow_up_timing || ""),
    source_note: String(move.source_note || ""),
    confidence: Math.min(1, Math.max(0, Number(move.confidence) || 0.5)),
    priority: ["now", "this_week", "soon"].includes(String(move.priority))
      ? String(move.priority)
      : "this_week",
    effort: String(move.effort || "about an hour"),
    expected_outcome: String(move.expected_outcome || ""),
    source_status: VALID_SOURCE_STATUSES.includes(move.source_status as MoveSourceStatus)
      ? (move.source_status as MoveSourceStatus)
      : "ai_suggested",
  };
}

async function generateMoves(profile: Profile, agentContext?: AgentContext): Promise<GeneratedMove[]> {
  const anthropic = client();
  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: MOVE_GENERATOR_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(profile, agentContext) }],
  });

  const raw = result.content[0]?.type === "text" ? result.content[0].text : "[]";
  const parsed = parseJson(raw);
  const moves: unknown[] = Array.isArray(parsed) ? parsed : [];
  if (moves.length === 0) {
    throw new KodaAiError("Move generation returned no results");
  }
  return moves.slice(0, 3).map((m) => sanitizeMove(m as Record<string, unknown>));
}

const STRING_KEYS: (keyof OnboardingExtracted)[] = [
  "name",
  "school",
  "year",
  "recruiting_stage",
  "timeline",
  "work_auth",
  "contacts",
  "proof_points",
  "success_definition",
];
const LIST_KEYS: (keyof OnboardingExtracted)[] = ["target_roles", "target_companies", "locations"];

/** Whitelist and coerce the model's extraction delta; unknown keys are dropped. */
function sanitizeExtracted(value: unknown): Partial<OnboardingExtracted> {
  if (typeof value !== "object" || value === null) return {};
  const raw = value as Record<string, unknown>;
  const out: Partial<OnboardingExtracted> = {};
  for (const key of STRING_KEYS) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) (out[key] as string) = v.trim().slice(0, 600);
  }
  for (const key of LIST_KEYS) {
    const v = raw[key];
    const list = (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? [v] : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 10);
    if (list.length) (out[key] as string[]) = list;
  }
  return out;
}

async function onboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult> {
  const anthropic = client();
  const result = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: ONBOARDING_TURN_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildOnboardingTurnPrompt(input) }],
  });
  const raw = result.content[0]?.type === "text" ? result.content[0].text : "{}";
  const parsed = parseJson(raw) as Record<string, unknown>;
  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) {
    throw new KodaAiError("Model returned no reply");
  }
  return { reply: reply.slice(0, 2000), extracted: sanitizeExtracted(parsed.extracted) };
}

export const anthropicProvider: KodaAI = {
  mode: "live",
  onboardingTurn,
  generateMoves,
};
