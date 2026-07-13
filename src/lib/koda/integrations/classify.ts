import type { NormalizedEvent } from "./types";
import type { EventClassification } from "@/lib/types";

/**
 * Deterministic event classification — keyword heuristics only, no AI. The
 * classifier decides which prompt bucket an event lands in (prep vs
 * deadline), so it must be cheap, explainable, and stable across syncs.
 */

const INTERVIEW_TERMS = [
  "interview",
  "onsite",
  "on-site",
  "phone screen",
  "technical screen",
  "final round",
  "superday",
];
const RECRUITER_TERMS = ["recruiter", "recruiting", "talent", "hiring team", "phone call"];
const COFFEE_TERMS = ["coffee", "chat", "intro", "catch up", "catch-up", "networking", "1:1"];
const DEADLINE_TERMS = ["deadline", "due", "apply by", "application due", "closes"];

export function classifyEvent(event: NormalizedEvent): EventClassification {
  const haystack = [event.title ?? "", event.description_snippet ?? ""]
    .join(" ")
    .toLowerCase();

  if (DEADLINE_TERMS.some((t) => haystack.includes(t))) return "deadline";
  if (INTERVIEW_TERMS.some((t) => haystack.includes(t))) return "interview";
  if (RECRUITER_TERMS.some((t) => haystack.includes(t))) return "recruiter_call";
  if (COFFEE_TERMS.some((t) => haystack.includes(t))) return "coffee_chat";
  return "other";
}
