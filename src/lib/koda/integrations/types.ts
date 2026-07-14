/**
 * Provider adapter contracts for the integration layer.
 *
 * Adapters are pull-only, with exactly two mail writes: createDraft and
 * sendMessage. Each is reachable from exactly one user-authenticated route
 * on an explicit per-move click; the sync engine, cron, and every AI-driven
 * path have no access to them, and no LLM output is on the send path (the
 * saved draft is sent verbatim to a recipient derived from the user's own
 * imported thread). "Koda never acts on its own" stays structural. Adapters
 * never touch token storage — callers inject a valid access token.
 */

export interface NormalizedEventAttendee {
  name: string | null;
  email: string | null;
}

/** Provider-agnostic calendar event, ready to upsert into external_events. */
export interface NormalizedEvent {
  external_id: string;
  title: string | null;
  description_snippet: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  attendees: NormalizedEventAttendee[];
  organizer_email: string | null;
  html_link: string | null;
  event_status: "confirmed" | "cancelled";
  source_updated_at: string | null;
}

/** Provider-agnostic job posting, ready to upsert into external_opportunities. */
export interface NormalizedOpportunity {
  external_id: string;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  absolute_url: string;
  source_posted_at: string | null;
  source_updated_at: string | null;
}

export interface CalendarPullInput {
  accessToken: string;
  /** Provider sync cursor (Google syncToken). Null forces a full window pull. */
  cursor: string | null;
  /** ISO bounds used on full resync; ignored during incremental pulls. */
  windowStart: string;
  windowEnd: string;
}

export interface CalendarPullResult {
  events: NormalizedEvent[];
  nextCursor: string | null;
  /** True when the provider invalidated the cursor and a full pull happened. */
  fullResync: boolean;
}

export interface CalendarSource {
  pullEvents(input: CalendarPullInput): Promise<CalendarPullResult>;
}

export interface OpportunityPullResult {
  postings: NormalizedOpportunity[];
  fetchedAt: string;
}

export interface OpportunitySource {
  pullPostings(board: { boardToken: string; company: string }): Promise<OpportunityPullResult>;
}

/** Provider-agnostic email thread metadata, ready to upsert into
 * external_threads. Bodies are never imported; snippet is the provider's
 * own preview text, truncated at write time. */
export interface NormalizedThread {
  external_id: string;
  subject: string | null;
  snippet: string | null;
  participants: NormalizedEventAttendee[];
  last_from_email: string | null;
  last_message_at: string | null;
  message_count: number;
  permalink: string | null;
  source_updated_at: string | null;
}

export interface MailPullResult {
  threads: NormalizedThread[];
}

/**
 * Mail access is split into a pull side (searchThreads, used by sync) and
 * two explicitly user-approved writes: createDraft and sendMessage. Both are
 * invoked exclusively by their explicit-click routes; sendMessage sends the
 * user-approved text verbatim, once, with claim-first idempotency enforced
 * by the route. Nothing autonomous can reach either method.
 */
export interface MailSource {
  searchThreads(input: {
    accessToken: string;
    query: string;
    maxResults: number;
  }): Promise<MailPullResult>;
  createDraft(input: {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<{ draftId: string }>;
  sendMessage(input: {
    accessToken: string;
    to: string;
    subject: string;
    body: string;
    threadId?: string;
  }): Promise<{ messageId: string }>;
}

/** Thrown by token/refresh code when the user must reconnect the provider. */
export class ReconnectRequiredError extends Error {
  constructor(message = "reconnect_required") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}
