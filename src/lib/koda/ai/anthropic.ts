import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@/lib/env";
import {
  MOVE_GENERATOR_SYSTEM_PROMPT,
  ONBOARDING_TURN_SYSTEM_PROMPT,
  ONGOING_TURN_SYSTEM_PROMPT,
  buildOnboardingTurnPrompt,
  buildOngoingTurnPrompt,
  buildUserPrompt,
} from "@/lib/koda/prompts";
import type { AgentContext, EffortBucket, MoveSourceStatus, MoveType, OnboardingExtracted, Profile } from "@/lib/types";
import type {
  GeneratedMove,
  KodaAI,
  OnboardingTurnInput,
  OnboardingTurnResult,
  OngoingIntent,
  OngoingProposal,
  OngoingTurnInput,
  OngoingTurnResult,
  ProfileDiffEntry,
  ProposedRelationship,
  UpdatableProfileField,
} from "./provider";
import { KodaAiError, UPDATABLE_PROFILE_FIELDS } from "./provider";

const MODEL = "claude-sonnet-4-5";

/** Separates spoken reply text from the trailing JSON metadata in streaming
 * turn responses. Kept out of user-visible deltas by holding back a tail. */
export const DATA_SENTINEL = "<<<DATA>>>";

/**
 * Stream a turn response in the reply-first protocol: plain reply text, then
 * DATA_SENTINEL, then a JSON object. Reply fragments are forwarded to onDelta
 * as they arrive (minus a held-back tail so a split sentinel never leaks);
 * returns the full reply and the parsed metadata object.
 */
async function streamTurn(
  system: string,
  prompt: string,
  onDelta?: (text: string) => void
): Promise<{ reply: string; data: Record<string, unknown> }> {
  const anthropic = client();
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 1000,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  let buffer = "";
  let emitted = 0;
  let sentinelSeen = false;
  const HOLDBACK = DATA_SENTINEL.length;

  stream.on("text", (text) => {
    if (sentinelSeen) return;
    buffer += text;
    const sentinelAt = buffer.indexOf(DATA_SENTINEL);
    if (sentinelAt >= 0) {
      sentinelSeen = true;
      if (sentinelAt > emitted) onDelta?.(buffer.slice(emitted, sentinelAt));
      emitted = sentinelAt;
      return;
    }
    // Emit everything except a sentinel-sized tail that might be a split marker.
    const safeEnd = Math.max(emitted, buffer.length - HOLDBACK);
    if (safeEnd > emitted) {
      onDelta?.(buffer.slice(emitted, safeEnd));
      emitted = safeEnd;
    }
  });

  await stream.finalMessage();
  const full = buffer;
  const sentinelAt = full.indexOf(DATA_SENTINEL);
  const reply = (sentinelAt >= 0 ? full.slice(0, sentinelAt) : full).trim();
  if (!sentinelSeen && reply && emitted < (sentinelAt >= 0 ? sentinelAt : full.length)) {
    onDelta?.(full.slice(emitted, sentinelAt >= 0 ? sentinelAt : full.length));
  }
  if (!reply) {
    throw new KodaAiError("Model returned no reply");
  }
  let data: Record<string, unknown> = {};
  if (sentinelAt >= 0) {
    try {
      data = parseJson(full.slice(sentinelAt + DATA_SENTINEL.length)) as Record<string, unknown>;
    } catch {
      // Metadata is best-effort: a reply with unparseable extraction still
      // reads correctly; the server-side checklist keeps state consistent.
      data = {};
    }
  }
  return { reply: reply.slice(0, 2000), data };
}

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
    effort_bucket: (["quick", "focused", "project"] as EffortBucket[]).includes(
      move.effort_bucket as EffortBucket
    )
      ? (move.effort_bucket as EffortBucket)
      : "focused",
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
  const { reply, data } = await streamTurn(
    ONBOARDING_TURN_SYSTEM_PROMPT,
    buildOnboardingTurnPrompt(input),
    input.onDelta
  );
  return { reply, extracted: sanitizeExtracted(data.extracted) };
}

const VALID_INTENTS: OngoingIntent[] = ["add_context", "update_profile", "ask_next_move", "chat"];

function cleanString(v: unknown, max = 500): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function cleanDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Whitelist and coerce the model's proposal; anything unrecognized is dropped. */
function sanitizeProposal(value: unknown): OngoingProposal | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const out: OngoingProposal = {};

  if (Array.isArray(raw.relationships)) {
    const relationships = raw.relationships
      .map((r): ProposedRelationship | null => {
        if (typeof r !== "object" || r === null) return null;
        const rel = r as Record<string, unknown>;
        const personName = cleanString(rel.person_name, 120);
        if (!personName) return null;
        return {
          person_name: personName,
          organization: cleanString(rel.organization, 200),
          role_title: cleanString(rel.role_title, 200),
          context: cleanString(rel.context, 500),
          interaction_date: cleanDate(rel.interaction_date),
          follow_up_date: cleanDate(rel.follow_up_date),
        };
      })
      .filter((r): r is ProposedRelationship => r !== null)
      .slice(0, 5);
    if (relationships.length) out.relationships = relationships;
  }

  if (Array.isArray(raw.profile_diff)) {
    const diff = raw.profile_diff
      .map((d): ProfileDiffEntry | null => {
        if (typeof d !== "object" || d === null) return null;
        const entry = d as Record<string, unknown>;
        const field = entry.field as UpdatableProfileField;
        if (!UPDATABLE_PROFILE_FIELDS.includes(field)) return null;
        const isList = ["target_roles", "target_companies", "locations"].includes(field);
        if (isList) {
          const list = (Array.isArray(entry.new_value) ? entry.new_value : [entry.new_value])
            .map((s) => cleanString(s, 120))
            .filter((s): s is string => s !== null)
            .slice(0, 12);
          return list.length ? { field, new_value: list } : null;
        }
        const str = cleanString(entry.new_value, 500);
        return str ? { field, new_value: str } : null;
      })
      .filter((d): d is ProfileDiffEntry => d !== null)
      .slice(0, 7);
    if (diff.length) out.profile_diff = diff;
  }

  return out.relationships || out.profile_diff ? out : undefined;
}

async function ongoingTurn(input: OngoingTurnInput): Promise<OngoingTurnResult> {
  const { reply, data } = await streamTurn(
    ONGOING_TURN_SYSTEM_PROMPT,
    buildOngoingTurnPrompt(input),
    input.onDelta
  );
  const intent = VALID_INTENTS.includes(data.intent as OngoingIntent)
    ? (data.intent as OngoingIntent)
    : "chat";
  return { reply, intent, proposal: sanitizeProposal(data.proposal) };
}

export const anthropicProvider: KodaAI = {
  mode: "live",
  onboardingTurn,
  ongoingTurn,
  generateMoves,
};
