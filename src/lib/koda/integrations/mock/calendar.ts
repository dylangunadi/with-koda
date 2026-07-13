import type { CalendarPullInput, CalendarPullResult, CalendarSource, NormalizedEvent } from "../types";

/**
 * Deterministic offline calendar for tests and keyless development,
 * mirroring ai/mock.ts. Events are generated relative to "now" so specs
 * about upcoming/past behavior stay stable on any date. Never returned to
 * users as real Google data: the integration is created through the mock
 * OAuth path, which labels the connection as a sample in the UI copy.
 */

function iso(offsetHours: number, durationMinutes = 30): { start: string; end: string } {
  const start = new Date(Date.now() + offsetHours * 3_600_000);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function buildMockEvents(): NormalizedEvent[] {
  const coffee = iso(48);
  const recruiter = iso(120);
  const pastCall = iso(-48);
  const cancelled = iso(72);
  return [
    {
      external_id: "mock-ev-coffee-1",
      title: "Coffee chat with Jordan Lee",
      description_snippet: "Intro chat about the APM program.",
      start_at: coffee.start,
      end_at: coffee.end,
      location: "Cafe Strada",
      attendees: [{ name: "Jordan Lee", email: "jordan.lee@stripe.com" }],
      organizer_email: "jordan.lee@stripe.com",
      html_link: "https://calendar.google.com/calendar/event?eid=mock-ev-coffee-1",
      event_status: "confirmed",
      source_updated_at: null,
    },
    {
      external_id: "mock-ev-recruiter-1",
      title: "Figma recruiter call",
      description_snippet: "Phone screen with university recruiting.",
      start_at: recruiter.start,
      end_at: recruiter.end,
      location: null,
      attendees: [{ name: "Sam Ortiz", email: "sortiz@figma.com" }],
      organizer_email: "sortiz@figma.com",
      html_link: "https://calendar.google.com/calendar/event?eid=mock-ev-recruiter-1",
      event_status: "confirmed",
      source_updated_at: null,
    },
    {
      external_id: "mock-ev-past-1",
      title: "Notion PM coffee chat",
      description_snippet: "Chat with a PM about the new grad role.",
      start_at: pastCall.start,
      end_at: pastCall.end,
      location: null,
      attendees: [{ name: "Priya Shah", email: "priya@notion.so" }],
      organizer_email: "priya@notion.so",
      html_link: "https://calendar.google.com/calendar/event?eid=mock-ev-past-1",
      event_status: "confirmed",
      source_updated_at: null,
    },
    {
      external_id: "mock-ev-cancelled-1",
      title: "Cancelled interview",
      description_snippet: null,
      start_at: cancelled.start,
      end_at: cancelled.end,
      location: null,
      attendees: [],
      organizer_email: null,
      html_link: "https://calendar.google.com/calendar/event?eid=mock-ev-cancelled-1",
      event_status: "cancelled",
      source_updated_at: null,
    },
  ];
}

export const mockCalendarSource: CalendarSource = {
  async pullEvents(input: CalendarPullInput): Promise<CalendarPullResult> {
    return {
      events: buildMockEvents(),
      nextCursor: "mock-sync-token-1",
      fullResync: input.cursor === null,
    };
  },
};
