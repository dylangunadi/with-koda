import { describe, expect, it } from "vitest";
import { normalizeGreenhouseJob } from "../jobs/greenhouse";
import { normalizeLeverPosting } from "../jobs/lever";
import { normalizeEvent } from "../google/calendar";
import { mockCalendarSource } from "../mock/calendar";
import { mockOpportunitySource } from "../mock/jobs";

describe("normalizeGreenhouseJob", () => {
  it("maps a well-formed job", () => {
    const job = {
      id: 4011,
      title: "APM Intern",
      absolute_url: "https://boards.greenhouse.io/notion/jobs/4011",
      updated_at: "2026-07-01T00:00:00Z",
      first_published: "2026-06-20T00:00:00Z",
      location: { name: "San Francisco" },
      departments: [{ name: "Product" }],
    };
    const posting = normalizeGreenhouseJob(job, "Notion");
    expect(posting).toEqual({
      external_id: "4011",
      company: "Notion",
      title: "APM Intern",
      location: "San Francisco",
      department: "Product",
      absolute_url: "https://boards.greenhouse.io/notion/jobs/4011",
      source_posted_at: "2026-06-20T00:00:00Z",
      source_updated_at: "2026-07-01T00:00:00Z",
    });
  });

  it("drops jobs missing required fields instead of crashing", () => {
    expect(normalizeGreenhouseJob({ title: "No id" }, "X")).toBeNull();
    expect(normalizeGreenhouseJob({ id: 1, absolute_url: "u" }, "X")).toBeNull();
    expect(normalizeGreenhouseJob({}, "X")).toBeNull();
  });

  it("tolerates absent optional structures", () => {
    const posting = normalizeGreenhouseJob(
      { id: "7", title: "SWE", absolute_url: "https://x" },
      "Acme"
    );
    expect(posting?.location).toBeNull();
    expect(posting?.department).toBeNull();
    expect(posting?.source_posted_at).toBeNull();
  });
});

describe("normalizeLeverPosting", () => {
  it("maps a well-formed posting", () => {
    const posting = normalizeLeverPosting(
      {
        id: "abc-123",
        text: "Product Analyst",
        hostedUrl: "https://jobs.lever.co/acme/abc-123",
        createdAt: 1780000000000,
        categories: { location: "NYC", team: "Growth" },
      },
      "Acme"
    );
    expect(posting?.external_id).toBe("abc-123");
    expect(posting?.title).toBe("Product Analyst");
    expect(posting?.department).toBe("Growth");
    expect(posting?.source_posted_at).toBe(new Date(1780000000000).toISOString());
  });

  it("drops malformed postings", () => {
    expect(normalizeLeverPosting({ text: "no id" }, "X")).toBeNull();
    expect(normalizeLeverPosting({ id: "1", text: "no url" }, "X")).toBeNull();
  });
});

describe("normalizeEvent (Google Calendar)", () => {
  it("maps a timed event and excludes the user themself from attendees", () => {
    const event = normalizeEvent({
      id: "ev1",
      status: "confirmed",
      summary: "Coffee chat",
      description: "x".repeat(900),
      location: "Cafe",
      htmlLink: "https://calendar.google.com/event?eid=ev1",
      updated: "2026-07-10T00:00:00Z",
      start: { dateTime: "2026-07-15T15:00:00Z" },
      end: { dateTime: "2026-07-15T15:30:00Z" },
      organizer: { email: "org@x.com" },
      attendees: [
        { email: "me@x.com", displayName: "Me", self: true },
        { email: "jordan@stripe.com", displayName: "Jordan Lee" },
      ],
    });
    expect(event?.external_id).toBe("ev1");
    expect(event?.description_snippet).toHaveLength(500);
    expect(event?.attendees).toEqual([{ name: "Jordan Lee", email: "jordan@stripe.com" }]);
    expect(event?.event_status).toBe("confirmed");
  });

  it("maps all-day events via start.date and flags cancellations", () => {
    const event = normalizeEvent({
      id: "ev2",
      status: "cancelled",
      start: { date: "2026-07-20" },
      end: { date: "2026-07-21" },
    });
    expect(event?.start_at).toBe("2026-07-20");
    expect(event?.event_status).toBe("cancelled");
  });

  it("drops events without an id", () => {
    expect(normalizeEvent({ summary: "ghost" })).toBeNull();
  });
});

describe("mock adapters (deterministic fixtures)", () => {
  it("mock calendar returns stable ids with upcoming, past, and cancelled events", async () => {
    const result = await mockCalendarSource.pullEvents({
      accessToken: "mock",
      cursor: null,
      windowStart: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      windowEnd: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });
    const ids = result.events.map((e) => e.external_id);
    expect(ids).toContain("mock-ev-coffee-1");
    expect(ids).toContain("mock-ev-past-1");
    expect(result.events.find((e) => e.external_id === "mock-ev-cancelled-1")?.event_status).toBe(
      "cancelled"
    );
    expect(result.fullResync).toBe(true);
    expect(result.nextCursor).toBe("mock-sync-token-1");
  });

  it("mock boards return exactly two stable postings per board", async () => {
    const a = await mockOpportunitySource.pullPostings({ boardToken: "notion", company: "Notion" });
    const b = await mockOpportunitySource.pullPostings({ boardToken: "notion", company: "Notion" });
    expect(a.postings).toHaveLength(2);
    expect(a.postings.map((p) => p.external_id)).toEqual(b.postings.map((p) => p.external_id));
  });
});
