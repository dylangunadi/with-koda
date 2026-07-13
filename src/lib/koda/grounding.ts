import type {
  AgentContext,
  ExternalEvent,
  ExternalOpportunity,
  ExternalThread,
  Profile,
  RecruitingMove,
} from "@/lib/types";
import type { GeneratedMove } from "./ai/provider";

/**
 * Verified grounding refs. The prompt renders external records as [EV1]/[OP1]
 * items; the model cites a ref; and this module resolves citations back to
 * real rows. Rendering and resolution share ONE ordering function, so a ref
 * always means the same record on both sides.
 *
 * The "verified" label is unforgeable by construction: a move claiming
 * verified without a resolvable ref is downgraded to ai_suggested and
 * stripped of links, no matter what the model said.
 */

export interface ExternalRef {
  ref: string;
  kind: "event" | "opportunity" | "thread";
  event?: ExternalEvent;
  opportunity?: ExternalOpportunity;
  thread?: ExternalThread;
}

export function buildExternalRefs(
  profile: Profile,
  agentContext?: AgentContext
): ExternalRef[] {
  if (!agentContext) return [];
  const refs: ExternalRef[] = [];

  const events = [
    ...(agentContext.calendar?.upcoming ?? []),
    ...(agentContext.calendar?.recent_past ?? []),
  ];
  events.forEach((event, i) => {
    refs.push({ ref: `EV${i + 1}`, kind: "event", event });
  });

  (agentContext.threads ?? []).forEach((thread, i) => {
    refs.push({ ref: `TH${i + 1}`, kind: "thread", thread });
  });

  // Target-company matches first, then newest (query already orders by
  // last_seen_at descending).
  const targets = (profile.target_companies ?? []).map((c) => c.trim().toLowerCase());
  const isTarget = (o: ExternalOpportunity) =>
    targets.includes(o.company.trim().toLowerCase()) ? 0 : 1;
  const opportunities = [...(agentContext.opportunities ?? [])].sort(
    (a, b) => isTarget(a) - isTarget(b)
  );
  opportunities.forEach((opportunity, i) => {
    refs.push({ ref: `OP${i + 1}`, kind: "opportunity", opportunity });
  });

  return refs;
}

export type GroundedMove = GeneratedMove & {
  external_event_id: string | null;
  external_opportunity_id: string | null;
  external_thread_id: string | null;
  source_url: string | null;
  source_fetched_at: string | null;
};

/** An event still needs prep until it has ended; all-day events stay
 * "upcoming" for their whole day. Parsed times, never lexical string
 * comparison (offset formats and date-only strings don't compare reliably). */
export function isEventUpcoming(event: ExternalEvent, now = new Date()): boolean {
  const endMs = Date.parse(event.end_at ?? event.start_at ?? "");
  return !Number.isNaN(endMs) && endMs >= now.getTime();
}

/**
 * Resolve model-cited refs against the actual context. Valid ref: link the
 * move to the real record and copy source URL + fetch time onto it. Invalid
 * or missing ref while claiming verified: downgrade. As a final dedup belt,
 * drop moves grounded in an event that already has a non-rejected move.
 */
export function resolveSourceRefs(
  moves: GeneratedMove[],
  profile: Profile,
  agentContext?: AgentContext
): GroundedMove[] {
  const refs = new Map(buildExternalRefs(profile, agentContext).map((r) => [r.ref, r]));
  const priorMoves = agentContext?.prior_moves ?? [];
  const handledEventIds = new Set(
    priorMoves
      .filter((m: RecruitingMove) => m.external_event_id && m.status !== "rejected")
      .map((m) => m.external_event_id as string)
  );
  const handledOppIds = new Set(
    priorMoves
      .filter((m: RecruitingMove) => m.external_opportunity_id && m.status !== "rejected")
      .map((m) => m.external_opportunity_id as string)
  );
  const handledThreadIds = new Set(
    priorMoves
      .filter((m: RecruitingMove) => m.external_thread_id && m.status !== "rejected")
      .map((m) => m.external_thread_id as string)
  );
  // Within-batch belt: if the model cites the same ref twice in one
  // generation, only the first move keeps it.
  const consumedRefs = new Set<string>();

  const resolved: GroundedMove[] = [];
  for (const move of moves) {
    const refId = (move.source_ref ?? "").trim().toUpperCase();
    const ref = refId && !consumedRefs.has(refId) ? refs.get(refId) : undefined;
    if (ref) consumedRefs.add(refId);

    if (ref?.kind === "event" && ref.event) {
      if (handledEventIds.has(ref.event.id)) continue; // duplicate belt
      resolved.push({
        ...move,
        source_ref: refId,
        source_status: "verified",
        external_event_id: ref.event.id,
        external_opportunity_id: null,
        external_thread_id: null,
        source_url: ref.event.html_link,
        source_fetched_at: ref.event.fetched_at,
      });
      continue;
    }
    if (ref?.kind === "opportunity" && ref.opportunity) {
      if (handledOppIds.has(ref.opportunity.id)) continue; // duplicate belt
      resolved.push({
        ...move,
        source_ref: refId,
        source_status: "verified",
        external_event_id: null,
        external_opportunity_id: ref.opportunity.id,
        external_thread_id: null,
        source_url: ref.opportunity.absolute_url,
        source_fetched_at: ref.opportunity.fetched_at,
      });
      continue;
    }
    if (ref?.kind === "thread" && ref.thread) {
      if (handledThreadIds.has(ref.thread.id)) continue; // duplicate belt
      resolved.push({
        ...move,
        source_ref: refId,
        source_status: "verified",
        external_event_id: null,
        external_opportunity_id: null,
        external_thread_id: ref.thread.id,
        source_url: ref.thread.permalink,
        source_fetched_at: ref.thread.fetched_at,
      });
      continue;
    }

    resolved.push({
      ...move,
      source_ref: null,
      // Unforgeable label: verified without a resolvable ref is a downgrade.
      source_status: move.source_status === "verified" ? "ai_suggested" : move.source_status,
      external_event_id: null,
      external_opportunity_id: null,
      external_thread_id: null,
      source_url: null,
      source_fetched_at: null,
    });
  }
  return resolved;
}

/** Last-line belt at the persistence boundary: a move cannot be written as
 * "verified" unless it actually links to an external record. Callers that
 * route through resolveSourceRefs never trip this; it exists so a future
 * code path that skips the resolver cannot forge the label. */
export function enforceVerifiedIntegrity<T extends GroundedMove>(move: T): T {
  const linked =
    move.external_event_id || move.external_opportunity_id || move.external_thread_id;
  if (move.source_status === "verified" && !linked) {
    return { ...move, source_status: "ai_suggested", source_url: null, source_fetched_at: null };
  }
  return move;
}

function formatEventTime(event: ExternalEvent): string {
  if (!event.start_at) return "time unknown";
  const d = new Date(event.start_at);
  return d.toUTCString().replace(/:\d\d GMT$/, " UTC");
}

const TITLE_MAX = 120;
const SNIPPET_MAX = 300;

/** Render the VERIFIED CALENDAR / VERIFIED OPENINGS prompt blocks. */
export function renderExternalBlocks(refs: ExternalRef[], now = new Date()): string[] {
  const parts: string[] = [];
  const eventRefs = refs.filter((r) => r.kind === "event" && r.event);
  const oppRefs = refs.filter((r) => r.kind === "opportunity" && r.opportunity);

  if (eventRefs.length > 0) {
    parts.push(
      "\nVERIFIED CALENDAR (from the student's connected calendar — real events, real attendee names you MAY use):"
    );
    for (const { ref, event } of eventRefs) {
      if (!event) continue;
      const upcoming = isEventUpcoming(event, now);
      const bits = [
        `[${ref}]`,
        formatEventTime(event),
        `"${(event.title ?? "untitled").slice(0, TITLE_MAX)}"`,
      ];
      const people = event.attendees
        .filter((a) => a.name || a.email)
        .slice(0, 3)
        .map((a) => (a.name ? `${a.name}${a.email ? ` (${a.email})` : ""}` : a.email))
        .join(", ");
      if (people) bits.push(`with ${people}`);
      if (event.classification) bits.push(`[${event.classification}]`);
      bits.push(upcoming ? "[needs prep]" : "[needs follow-up]");
      if (event.description_snippet) {
        bits.push(`— ${event.description_snippet.slice(0, SNIPPET_MAX)}`);
      }
      parts.push(`- ${bits.join(" ")}`);
    }
  }

  const threadRefs = refs.filter((r) => r.kind === "thread" && r.thread);
  if (threadRefs.length > 0) {
    parts.push(
      "\nVERIFIED EMAIL THREADS (imported from the student's connected Gmail via their recruiting search — real conversations awaiting the student's reply; participant names are real and you MAY use them):"
    );
    for (const { ref, thread } of threadRefs) {
      if (!thread) continue;
      const counterpart = thread.participants.find(
        (p) => p.email && p.email === thread.last_from_email
      );
      const bits = [
        `[${ref}]`,
        `"${(thread.subject ?? "no subject").slice(0, TITLE_MAX)}"`,
      ];
      if (counterpart?.name || counterpart?.email) {
        bits.push(`from ${counterpart.name ?? counterpart.email}`);
      }
      if (thread.last_message_at) {
        bits.push(`last message ${thread.last_message_at.slice(0, 10)}`);
      }
      bits.push("[needs reply]");
      if (thread.snippet) bits.push(`— ${thread.snippet.slice(0, SNIPPET_MAX)}`);
      parts.push(`- ${bits.join(" ")}`);
    }
  }

  if (oppRefs.length > 0) {
    parts.push(
      "\nVERIFIED OPENINGS (live on official job boards; every one has a real URL — never invent openings beyond these):"
    );
    for (const { ref, opportunity } of oppRefs) {
      if (!opportunity) continue;
      const bits = [
        `[${ref}]`,
        opportunity.company,
        "—",
        opportunity.title.slice(0, TITLE_MAX),
      ];
      if (opportunity.location) bits.push(`(${opportunity.location})`);
      if (opportunity.source_posted_at) {
        bits.push(`— posted ${opportunity.source_posted_at.slice(0, 10)}`);
      }
      bits.push(`— ${opportunity.absolute_url}`);
      parts.push(`- ${bits.join(" ")}`);
    }
  }

  return parts;
}
