import "server-only";
import type { MailPullResult, MailSource, NormalizedThread } from "../types";

/**
 * Gmail adapter over plain fetch. Read side: thread search scoped to the
 * user's configured recruiting query with format=metadata — headers and the
 * API's own snippet only, never message bodies. Write side: draft creation
 * (users/me/drafts) and messages.send — each called exclusively from its
 * explicit-per-move route, sending the user-approved text verbatim. Nothing
 * in sync, cron, or AI-driven code can reach either write.
 */

const GMAIL_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const FETCH_TIMEOUT_MS = 10_000;
const SNIPPET_MAX = 300;
const THREAD_DETAIL_CAP = 25;

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailMessage {
  id?: string;
  internalDate?: string;
  snippet?: string;
  payload?: { headers?: GmailHeader[] };
}

interface GmailThread {
  id?: string;
  messages?: GmailMessage[];
}

function header(message: GmailMessage | undefined, name: string): string | null {
  const found = message?.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase()
  );
  return found?.value ?? null;
}

/** "Jamie Wu <jamie@stripe.com>" → {name: "Jamie Wu", email: "jamie@stripe.com"} */
export function parseAddress(raw: string | null): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || null, email: match[2].trim().toLowerCase() };
  }
  const bare = raw.trim();
  return bare.includes("@")
    ? { name: null, email: bare.toLowerCase() }
    : { name: bare || null, email: null };
}

export function normalizeThread(thread: GmailThread): NormalizedThread | null {
  if (!thread.id) return null;
  const messages = thread.messages ?? [];
  const last = messages[messages.length - 1];

  const participants = new Map<string, { name: string | null; email: string | null }>();
  for (const message of messages.slice(-6)) {
    for (const field of ["From", "To"]) {
      for (const part of (header(message, field) ?? "").split(",")) {
        const addr = parseAddress(part.trim() || null);
        if (addr.email && !participants.has(addr.email)) {
          participants.set(addr.email, addr);
        }
      }
    }
  }

  const lastFrom = parseAddress(header(last, "From"));
  const lastMs = last?.internalDate ? Number(last.internalDate) : NaN;

  return {
    external_id: thread.id,
    subject: header(messages[0], "Subject"),
    snippet: last?.snippet ? last.snippet.slice(0, SNIPPET_MAX) : null,
    participants: Array.from(participants.values()).slice(0, 8),
    last_from_email: lastFrom.email,
    last_message_at: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
    message_count: messages.length,
    permalink: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
    source_updated_at: Number.isFinite(lastMs) ? new Date(lastMs).toISOString() : null,
  };
}

async function gmailGet(accessToken: string, path: string): Promise<Response> {
  return fetch(`${GMAIL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

/** RFC 2822 message, base64url-encoded, for the drafts endpoint. */
export function buildRawMessage(input: { to: string; subject: string; body: string }): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    input.body,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

export const gmailSource: MailSource = {
  async searchThreads({ accessToken, query, maxResults }): Promise<MailPullResult> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(maxResults, THREAD_DETAIL_CAP)),
    });
    const listRes = await gmailGet(accessToken, `/threads?${params.toString()}`);
    if (!listRes.ok) {
      throw new Error(`Gmail thread search failed (${listRes.status})`);
    }
    const list = await listRes.json();
    const ids: string[] = (Array.isArray(list?.threads) ? list.threads : [])
      .map((t: { id?: string }) => t.id)
      .filter(Boolean)
      .slice(0, THREAD_DETAIL_CAP);

    const threads: NormalizedThread[] = [];
    for (const id of ids) {
      const detailRes = await gmailGet(
        accessToken,
        `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`
      );
      if (!detailRes.ok) continue; // one bad thread never poisons the sync
      const normalized = normalizeThread((await detailRes.json()) as GmailThread);
      if (normalized) threads.push(normalized);
    }
    return { threads };
  },

  async createDraft({ accessToken, to, subject, body, threadId }) {
    const res = await fetch(`${GMAIL_BASE}/drafts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        message: {
          raw: buildRawMessage({ to, subject, body }),
          ...(threadId ? { threadId } : {}),
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Gmail draft creation failed (${res.status})`);
    }
    const data = await res.json();
    return { draftId: String(data.id ?? "") };
  },

  async sendMessage({ accessToken, to, subject, body, threadId }) {
    const res = await fetch(`${GMAIL_BASE}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        raw: buildRawMessage({ to, subject, body }),
        ...(threadId ? { threadId } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Gmail send failed (${res.status})`);
    }
    const data = await res.json();
    return { messageId: String(data.id ?? "") };
  },
};
