import "server-only";
import type {
  CalendarPullInput,
  CalendarPullResult,
  CalendarSource,
  NormalizedEvent,
} from "../types";

/**
 * Google Calendar read-only adapter over plain fetch. Incremental sync uses
 * Google's syncToken protocol: pass the stored cursor, and on HTTP 410 (token
 * expired/invalidated) fall back to one bounded full-window pull and report
 * fullResync so the engine replaces its cursor.
 */

const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const PAGE_SIZE = 250;
const MAX_PAGES = 8; // hard bound; a student calendar never legitimately exceeds this
const FETCH_TIMEOUT_MS = 10_000;
const SNIPPET_MAX = 500;

interface GoogleEventsPage {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

interface GoogleEvent {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  updated?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
}

async function fetchPage(
  accessToken: string,
  params: URLSearchParams
): Promise<{ status: number; page: GoogleEventsPage | null }> {
  const res = await fetch(`${EVENTS_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    return { status: res.status, page: null };
  }
  const page = (await res.json()) as GoogleEventsPage;
  return { status: res.status, page };
}

async function pullAllPages(
  accessToken: string,
  baseParams: Record<string, string>
): Promise<{ status: number; events: NormalizedEvent[]; nextSyncToken: string | null }> {
  const events: NormalizedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({ ...baseParams, maxResults: String(PAGE_SIZE) });
    if (pageToken) params.set("pageToken", pageToken);

    const { status, page } = await fetchPage(accessToken, params);
    if (!page) {
      return { status, events: [], nextSyncToken: null };
    }
    for (const item of page.items ?? []) {
      const normalized = normalizeEvent(item);
      if (normalized) events.push(normalized);
    }
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
    if (!page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }

  return { status: 200, events, nextSyncToken };
}

function normalizeEvent(item: GoogleEvent): NormalizedEvent | null {
  if (!item.id) return null;
  const attendees = (item.attendees ?? [])
    .filter((a) => !a.self)
    .slice(0, 10)
    .map((a) => ({ name: a.displayName ?? null, email: a.email ?? null }));

  return {
    external_id: item.id,
    title: item.summary ?? null,
    description_snippet: item.description ? item.description.slice(0, SNIPPET_MAX) : null,
    start_at: item.start?.dateTime ?? item.start?.date ?? null,
    end_at: item.end?.dateTime ?? item.end?.date ?? null,
    location: item.location ?? null,
    attendees,
    organizer_email: item.organizer?.email ?? null,
    html_link: item.htmlLink ?? null,
    event_status: item.status === "cancelled" ? "cancelled" : "confirmed",
    source_updated_at: item.updated ?? null,
  };
}

export const googleCalendarSource: CalendarSource = {
  async pullEvents(input: CalendarPullInput): Promise<CalendarPullResult> {
    // Incremental pull with the stored cursor. Google forbids combining
    // syncToken with time bounds, so the cursor rides alone.
    if (input.cursor) {
      const incremental = await pullAllPages(input.accessToken, {
        singleEvents: "true",
        syncToken: input.cursor,
      });
      if (incremental.status === 200) {
        return {
          events: incremental.events,
          nextCursor: incremental.nextSyncToken,
          fullResync: false,
        };
      }
      if (incremental.status !== 410) {
        throw new Error(`Google Calendar sync failed (${incremental.status})`);
      }
      // 410 Gone: cursor invalidated — fall through to a full window pull.
    }

    const full = await pullAllPages(input.accessToken, {
      singleEvents: "true",
      timeMin: input.windowStart,
      timeMax: input.windowEnd,
    });
    if (full.status !== 200) {
      throw new Error(`Google Calendar full sync failed (${full.status})`);
    }
    return { events: full.events, nextCursor: full.nextSyncToken, fullResync: true };
  },
};

export { normalizeEvent };
