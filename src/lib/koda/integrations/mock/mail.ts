import type { MailPullResult, MailSource, NormalizedThread } from "../types";

/**
 * Deterministic offline mail source for tests and keyless development.
 * Thread times are relative to "now" so needs-reply specs stay stable.
 * Drafts are acknowledged with a stable id and never touch any mailbox.
 */

function iso(offsetHours: number): string {
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString();
}

function buildThreads(): NormalizedThread[] {
  return [
    {
      external_id: "mock-th-recruiter-1",
      subject: "Re: APM application at Stripe",
      snippet:
        "Thanks for your application! Do you have time this week for a quick intro call?",
      participants: [
        { name: "Jamie Wu", email: "jamie.wu@stripe.com" },
        { name: null, email: "student@example.com" },
      ],
      last_from_email: "jamie.wu@stripe.com",
      last_message_at: iso(-72),
      message_count: 3,
      permalink: "https://mail.google.com/mail/u/0/#all/mock-th-recruiter-1",
      source_updated_at: iso(-72),
    },
    {
      external_id: "mock-th-answered-1",
      subject: "Coffee chat follow-up",
      snippet: "Sounds great, see you Thursday!",
      participants: [{ name: "Priya Shah", email: "priya@notion.so" }],
      last_from_email: "student@example.com",
      last_message_at: iso(-24),
      message_count: 4,
      permalink: "https://mail.google.com/mail/u/0/#all/mock-th-answered-1",
      source_updated_at: iso(-24),
    },
  ];
}

export const mockMailSource: MailSource = {
  async searchThreads(): Promise<MailPullResult> {
    return { threads: buildThreads() };
  },
  async createDraft() {
    return { draftId: "mock-draft-1" };
  },
  async sendMessage() {
    return { messageId: "mock-sent-1" };
  },
};
