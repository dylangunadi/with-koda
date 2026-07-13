import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RecruitingMove,
  MoveEvent,
  MoveType,
  AgentContext,
  CalendarContext,
  ExternalEvent,
  ExternalOpportunity,
  FeedbackPattern,
  Relationship,
} from "@/lib/types";

// Hard caps on external context so the model prompt stays bounded no matter
// how busy a calendar or board gets. Tune here, nowhere else.
const UPCOMING_EVENTS_LIMIT = 8;
const UPCOMING_WINDOW_DAYS = 14;
const RECENT_PAST_EVENTS_LIMIT = 4;
const RECENT_PAST_WINDOW_DAYS = 7;
const OPPORTUNITIES_LIMIT = 8;

/**
 * Build agent context from a user's historical moves and events.
 * This gives the LLM awareness of what the user liked, rejected, edited, and sent.
 */
export async function buildAgentContext(
  supabase: SupabaseClient,
  userId: string
): Promise<AgentContext> {
  // Fetch last 50 moves (enough for pattern detection without bloating prompt)
  const { data: moves } = await supabase
    .from("recruiting_moves")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  const priorMoves = (moves ?? []) as RecruitingMove[];

  // Fetch events for these moves
  const moveIds = priorMoves.map((m) => m.id);
  let events: MoveEvent[] = [];

  if (moveIds.length > 0) {
    const { data: eventsData } = await supabase
      .from("move_events")
      .select("*")
      .in("move_id", moveIds)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    events = (eventsData ?? []) as MoveEvent[];
  }

  // Relationship memory captured through Talk to Koda (user-confirmed only).
  const { data: relationshipRows } = await supabase
    .from("relationships")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const feedback = extractFeedbackPatterns(priorMoves, events);

  const [calendar, opportunities] = await Promise.all([
    loadCalendarContext(supabase, userId, priorMoves),
    loadOpportunities(supabase, userId),
  ]);

  return {
    prior_moves: priorMoves,
    move_events: events,
    feedback,
    relationships: (relationshipRows ?? []) as Relationship[],
    calendar,
    opportunities,
  };
}

/**
 * Verified calendar context from connected integrations. Upcoming events
 * drive prep moves; recent past events without an existing non-rejected move
 * drive follow-up moves. Cancelled events are excluded from both.
 */
async function loadCalendarContext(
  supabase: SupabaseClient,
  userId: string,
  priorMoves: RecruitingMove[]
): Promise<CalendarContext> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000);
  const windowStart = new Date(now.getTime() - RECENT_PAST_WINDOW_DAYS * 86_400_000);

  const { data: eventRows } = await supabase
    .from("external_events")
    .select("*")
    .eq("user_id", userId)
    .eq("event_status", "confirmed")
    .gte("start_at", windowStart.toISOString())
    .lte("start_at", windowEnd.toISOString())
    .order("start_at", { ascending: true })
    .limit(UPCOMING_EVENTS_LIMIT + RECENT_PAST_EVENTS_LIMIT + 8);

  const all = (eventRows ?? []) as ExternalEvent[];

  // Events that already produced a move the user hasn't rejected are handled;
  // suggesting them again would be a duplicate.
  const handledEventIds = new Set(
    priorMoves
      .filter((m) => m.external_event_id && m.status !== "rejected")
      .map((m) => m.external_event_id as string)
  );

  const nowIso = now.toISOString();
  const upcoming = all
    .filter((e) => e.start_at && e.start_at >= nowIso)
    .slice(0, UPCOMING_EVENTS_LIMIT);
  const recentPast = all
    .filter((e) => e.start_at && e.start_at < nowIso && !handledEventIds.has(e.id))
    .slice(-RECENT_PAST_EVENTS_LIMIT);

  return { upcoming, recent_past: recentPast };
}

/** Live verified opportunities, newest first. (Target-company prioritization
 * happens at prompt serialization, where the profile is in hand.) */
async function loadOpportunities(
  supabase: SupabaseClient,
  userId: string
): Promise<ExternalOpportunity[]> {
  const { data: rows } = await supabase
    .from("external_opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("verification_status", "verified_live")
    .order("last_seen_at", { ascending: false })
    .limit(OPPORTUNITIES_LIMIT);

  return (rows ?? []) as ExternalOpportunity[];
}

function extractFeedbackPatterns(
  moves: RecruitingMove[],
  events: MoveEvent[]
): FeedbackPattern {
  const accepted = moves.filter((m) => m.status === "accepted");
  const rejected = moves.filter((m) => m.status === "rejected");
  const saved = moves.filter((m) => m.status === "saved");
  const sent = moves.filter((m) => m.status === "sent");
  const editedEvents = events.filter((e) => e.event_type === "edited");

  // Types the user acted on: accepted, completed, or legacy sent all signal
  // "more like this".
  const acceptedAndSent = moves.filter(
    (m) => m.status === "accepted" || m.status === "sent" || m.status === "completed"
  );
  const boostTypes = countByType(acceptedAndSent);
  const reduceTypes = countByType(rejected);

  // Companies the user engages with
  const boostCompanies = extractCompanies(acceptedAndSent);
  const reduceCompanies = extractCompanies(rejected);

  // Tone signals from edited drafts
  const toneSignals: string[] = [];
  if (editedEvents.length > 3) {
    toneSignals.push("User frequently edits outreach drafts — keep tone closer to casual and concise.");
  }
  if (sent.length > 0 && accepted.length > sent.length) {
    toneSignals.push("User accepts more moves than they send — they may be selective about outreach timing.");
  }

  // Effort calibration: compare predicted buckets against what users report
  // at completion, and steer future sizing accordingly.
  const BUCKET_ORDER = ["quick", "focused", "project"];
  const calibrated = moves.filter((m) => m.effort_bucket && m.actual_effort_bucket);
  if (calibrated.length >= 2) {
    const drift = calibrated.reduce(
      (sum, m) =>
        sum +
        (BUCKET_ORDER.indexOf(m.actual_effort_bucket as string) -
          BUCKET_ORDER.indexOf(m.effort_bucket as string)),
      0
    );
    if (drift >= 2) {
      toneSignals.push(
        "Effort estimates run LOW for this student: moves regularly take a bucket longer than predicted. Size effort_bucket conservatively (round up)."
      );
    } else if (drift <= -2) {
      toneSignals.push(
        "Effort estimates run HIGH for this student: moves finish faster than predicted. Size effort_bucket down when in doubt."
      );
    }
  }

  return {
    boost_types: boostTypes,
    boost_companies: boostCompanies,
    reduce_types: reduceTypes,
    reduce_companies: reduceCompanies,
    tone_signals: toneSignals,
    edited_drafts_count: editedEvents.length,
    total_accepted: accepted.length,
    total_rejected: rejected.length,
    total_sent: sent.length,
    total_saved: saved.length,
  };
}

function countByType(moves: RecruitingMove[]): MoveType[] {
  const counts = new Map<MoveType, number>();
  for (const m of moves) {
    counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
  }
  // Return types that appear 2+ times (real pattern, not noise)
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);
}

function extractCompanies(moves: RecruitingMove[]): string[] {
  const counts = new Map<string, number>();
  const originalCasing = new Map<string, string>();
  for (const m of moves) {
    if (m.company) {
      const key = m.company.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!originalCasing.has(key)) {
        originalCasing.set(key, m.company);
      }
    }
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => originalCasing.get(key)!);
}
