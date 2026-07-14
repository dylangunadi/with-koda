import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasComposeScope } from "./google/oauth";
import type { ExternalThread, Integration } from "@/lib/types";

/**
 * Shared gating for the two explicit Gmail writes (draft and send). Both
 * routes resolve through here, so a send can never derive a recipient the
 * draft path couldn't: the move must be the user's own, carry draft text,
 * and be grounded in an imported thread — that thread is the only place a
 * recipient can come from. Koda never invents an address.
 */

interface MoveRow {
  id: string;
  title: string;
  outreach_draft: string | null;
  external_thread_id: string | null;
  gmail_sent_at: string | null;
}

export type GmailMoveContext =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      move: MoveRow;
      thread: ExternalThread;
      integration: Integration;
      recipient: string;
      subject: string;
      threadExternalId: string;
    };

export async function resolveGmailMoveContext(
  supabase: SupabaseClient,
  userId: string,
  moveId: string
): Promise<GmailMoveContext> {
  const { data: move } = await supabase
    .from("recruiting_moves")
    .select("id, title, outreach_draft, external_thread_id, gmail_sent_at")
    .eq("id", moveId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!move) {
    return { ok: false, status: 404, error: "Move not found" };
  }
  if (!move.outreach_draft?.trim()) {
    return { ok: false, status: 400, error: "This move has no draft text" };
  }
  if (!move.external_thread_id) {
    return {
      ok: false,
      status: 400,
      error: "Only moves linked to an imported thread can use Gmail actions",
    };
  }

  const { data: thread } = await supabase
    .from("external_threads")
    .select("*")
    .eq("id", move.external_thread_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!thread) {
    return { ok: false, status: 404, error: "The linked thread is no longer imported" };
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!integration || integration.status !== "connected") {
    return { ok: false, status: 404, error: "Gmail is not connected" };
  }
  if (!hasComposeScope(integration.scopes ?? [])) {
    return {
      ok: false,
      status: 403,
      error: "Draft access was not granted. Reconnect Gmail and allow draft creation.",
    };
  }

  const threadRow = thread as ExternalThread;
  // account_label may carry decoration; compare against the email token only.
  const accountEmail =
    (integration.account_label ?? "").toLowerCase().match(/[^\s<>()]+@[^\s<>()]+/)?.[0] ?? "";
  // Reply to the thread's counterpart: the last sender if it wasn't the user,
  // otherwise the first participant who isn't the user.
  const recipient =
    threadRow.last_from_email && threadRow.last_from_email.toLowerCase() !== accountEmail
      ? threadRow.last_from_email
      : (threadRow.participants.find(
          (p) => p.email && p.email.toLowerCase() !== accountEmail
        )?.email ?? null);

  if (!recipient) {
    return { ok: false, status: 400, error: "Could not determine a recipient from the thread" };
  }

  const subject = threadRow.subject
    ? threadRow.subject.startsWith("Re:")
      ? threadRow.subject
      : `Re: ${threadRow.subject}`
    : move.title;

  return {
    ok: true,
    move: move as MoveRow,
    thread: threadRow,
    integration: integration as Integration,
    recipient,
    subject,
    threadExternalId: threadRow.external_id,
  };
}
