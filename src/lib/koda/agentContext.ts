import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RecruitingMove,
  MoveEvent,
  MoveType,
  AgentContext,
  FeedbackPattern,
} from "@/lib/types";

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

  const feedback = extractFeedbackPatterns(priorMoves, events);

  return {
    prior_moves: priorMoves,
    move_events: events,
    feedback,
  };
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

  // Types the user tends to accept/send (use both for pattern detection)
  const acceptedAndSent = moves.filter((m) => m.status === "accepted" || m.status === "sent");
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
  if (sent.length > 0 && (accepted.length + sent.length) > sent.length * 3) {
    toneSignals.push("User accepts more moves than they send — they may be selective about outreach timing.");
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
