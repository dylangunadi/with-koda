import { describe, expect, it } from "vitest";
import { buildRawMessage, normalizeThread, parseAddress } from "../google/gmail";
import { mockMailSource } from "../mock/mail";

describe("parseAddress", () => {
  it("parses name-and-email form", () => {
    expect(parseAddress('Jamie Wu <jamie@stripe.com>')).toEqual({
      name: "Jamie Wu",
      email: "jamie@stripe.com",
    });
    expect(parseAddress('"Wu, Jamie" <Jamie@Stripe.com>')).toEqual({
      name: "Wu, Jamie",
      email: "jamie@stripe.com",
    });
  });

  it("parses bare emails and tolerates junk", () => {
    expect(parseAddress("jamie@stripe.com")).toEqual({ name: null, email: "jamie@stripe.com" });
    expect(parseAddress(null)).toEqual({ name: null, email: null });
    expect(parseAddress("Undisclosed recipients")).toEqual({
      name: "Undisclosed recipients",
      email: null,
    });
  });
});

describe("normalizeThread", () => {
  const thread = {
    id: "t1",
    messages: [
      {
        id: "m1",
        internalDate: "1783900000000",
        snippet: "first",
        payload: {
          headers: [
            { name: "From", value: "Student <student@example.com>" },
            { name: "To", value: "Jamie Wu <jamie@stripe.com>" },
            { name: "Subject", value: "APM application" },
          ],
        },
      },
      {
        id: "m2",
        internalDate: "1783990000000",
        snippet: "Do you have time this week?",
        payload: {
          headers: [
            { name: "From", value: "Jamie Wu <jamie@stripe.com>" },
            { name: "To", value: "student@example.com" },
          ],
        },
      },
    ],
  };

  it("maps subject from the first message and reply state from the last", () => {
    const normalized = normalizeThread(thread);
    expect(normalized?.external_id).toBe("t1");
    expect(normalized?.subject).toBe("APM application");
    expect(normalized?.snippet).toBe("Do you have time this week?");
    expect(normalized?.last_from_email).toBe("jamie@stripe.com");
    expect(normalized?.message_count).toBe(2);
    expect(normalized?.permalink).toContain("t1");
    expect(normalized?.participants).toEqual(
      expect.arrayContaining([
        { name: "Jamie Wu", email: "jamie@stripe.com" },
        { name: "Student", email: "student@example.com" },
      ])
    );
  });

  it("drops threads without an id", () => {
    expect(normalizeThread({ messages: [] })).toBeNull();
  });
});

describe("buildRawMessage", () => {
  it("produces base64url RFC 2822 with the exact body", () => {
    const raw = buildRawMessage({
      to: "jamie@stripe.com",
      subject: "Re: APM application",
      body: "Hi Jamie, yes!",
    });
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("To: jamie@stripe.com");
    expect(decoded).toContain("Subject: Re: APM application");
    expect(decoded.endsWith("Hi Jamie, yes!")).toBe(true);
  });
});

describe("mock mail source", () => {
  it("returns one thread awaiting reply and one already answered", async () => {
    const { threads } = await mockMailSource.searchThreads({
      accessToken: "mock",
      query: "anything",
      maxResults: 25,
    });
    expect(threads.map((t) => t.external_id)).toEqual([
      "mock-th-recruiter-1",
      "mock-th-answered-1",
    ]);
    // The recruiter thread's last word is theirs; the other is the student's.
    expect(threads[0].last_from_email).toBe("jamie.wu@stripe.com");
    expect(threads[1].last_from_email).toBe("student@example.com");
  });

  it("acknowledges drafts without touching anything", async () => {
    await expect(
      mockMailSource.createDraft({ accessToken: "mock", to: "a@b.c", subject: "s", body: "b" })
    ).resolves.toEqual({ draftId: "mock-draft-1" });
  });
});
