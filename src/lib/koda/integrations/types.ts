/**
 * Provider adapter contracts for the integration layer.
 *
 * Adapters are pull-only by design: there is no interface through which an
 * adapter can send, create, or modify anything on the provider side, so
 * "Koda never contacts anyone" is structural rather than policy. Adapters
 * never touch token storage — the sync engine injects a valid access token.
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

/** Thrown by token/refresh code when the user must reconnect the provider. */
export class ReconnectRequiredError extends Error {
  constructor(message = "reconnect_required") {
    super(message);
    this.name = "ReconnectRequiredError";
  }
}
