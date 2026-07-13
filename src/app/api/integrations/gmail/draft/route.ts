import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasComposeScope } from "@/lib/koda/integrations/google/oauth";
import { getMailSource, isForcedIntegrationFailure } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { getValidAccessToken } from "@/lib/koda/integrations/tokens";
import { logKodaEvent } from "@/lib/koda/events";
import type { ExternalThread } from "@/lib/types";

/**
 * Create a Gmail DRAFT from a move's outreach draft — the one integration
 * write Koda performs, and only on this explicit per-move user action.
 * The draft lands in the user's Drafts folder for them to review and send
 * themselves; nothing here (or anywhere in Koda) calls Gmail's send API.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let moveId: string;
  try {
    const body = await request.json();
    moveId = body.move_id;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!moveId || typeof moveId !== "string") {
    return NextResponse.json({ error: "move_id is required" }, { status: 400 });
  }

  // The move must be the user's own, carry an edited-or-generated draft, and
  // be grounded in an imported thread (that is where the recipient comes from
  // — Koda never invents an address).
  const { data: move } = await supabase
    .from("recruiting_moves")
    .select("id, title, outreach_draft, external_thread_id")
    .eq("id", moveId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!move) {
    return NextResponse.json({ error: "Move not found" }, { status: 404 });
  }
  if (!move.outreach_draft?.trim()) {
    return NextResponse.json({ error: "This move has no draft text" }, { status: 400 });
  }
  if (!move.external_thread_id) {
    return NextResponse.json(
      { error: "Only moves linked to an imported thread can become Gmail drafts" },
      { status: 400 }
    );
  }

  const { data: thread } = await supabase
    .from("external_threads")
    .select("*")
    .eq("id", move.external_thread_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!thread) {
    return NextResponse.json({ error: "The linked thread is no longer imported" }, { status: 404 });
  }

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .maybeSingle();

  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ error: "Gmail is not connected" }, { status: 404 });
  }
  if (!hasComposeScope(integration.scopes ?? [])) {
    return NextResponse.json(
      { error: "Draft access was not granted. Reconnect Gmail and allow draft creation." },
      { status: 403 }
    );
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
    return NextResponse.json(
      { error: "Could not determine a recipient from the thread" },
      { status: 400 }
    );
  }

  if (isForcedIntegrationFailure(request.headers)) {
    return NextResponse.json({ error: "Draft creation failed" }, { status: 502 });
  }

  try {
    const serviceClient = createServiceClient();
    const accessToken = await getValidAccessToken(serviceClient, integration.id);
    const mail = await getMailSource();
    const subject = threadRow.subject
      ? threadRow.subject.startsWith("Re:")
        ? threadRow.subject
        : `Re: ${threadRow.subject}`
      : move.title;
    const { draftId } = await mail.createDraft({
      accessToken,
      to: recipient,
      subject,
      body: move.outreach_draft,
      threadId: threadRow.external_id,
    });

    logKodaEvent(supabase, user.id, "gmail_draft_created", { move_id: move.id });
    return NextResponse.json({ ok: true, draftId });
  } catch (err) {
    console.error("[integrations] gmail draft failed:", err);
    return NextResponse.json({ error: "Draft creation failed" }, { status: 502 });
  }
}
