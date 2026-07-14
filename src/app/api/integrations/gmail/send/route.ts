import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveGmailMoveContext } from "@/lib/koda/integrations/gmailMoveContext";
import { getMailSource, isForcedIntegrationFailure } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { getValidAccessToken } from "@/lib/koda/integrations/tokens";
import { logKodaEvent } from "@/lib/koda/events";

/**
 * The ONLY send in the product. Explicit per-move user action, fully
 * deterministic: the saved outreach draft is sent verbatim, once, to the
 * counterpart of the user's own imported thread. No LLM is on this path.
 *
 * dry_run returns exactly what would be sent (recipient, subject, body) so
 * the confirm dialog shows the server's truth, not a client guess.
 *
 * Idempotency is claim-first, like the sync engine: gmail_sent_at is claimed
 * before the Gmail call, so a double-click or retry gets 409 and can never
 * produce two emails. A Gmail failure rolls the claim back. The moves PATCH
 * route still rejects any client-set 'sent' status — nothing may merely
 * claim a message went out.
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
  let dryRun: boolean;
  try {
    const body = await request.json();
    moveId = body.move_id;
    dryRun = body.dry_run === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!moveId || typeof moveId !== "string") {
    return NextResponse.json({ error: "move_id is required" }, { status: 400 });
  }

  const context = await resolveGmailMoveContext(supabase, user.id, moveId);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (context.move.gmail_sent_at) {
    return NextResponse.json({ error: "This message was already sent" }, { status: 409 });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      recipient: context.recipient,
      subject: context.subject,
      body: context.move.outreach_draft,
    });
  }

  // Test hook fires before the claim, so a forced failure never consumes
  // idempotency.
  if (isForcedIntegrationFailure(request.headers)) {
    return NextResponse.json({ error: "Send failed" }, { status: 502 });
  }

  // Claim-first: exactly one request wins the null -> timestamp transition.
  const { data: claimed } = await supabase
    .from("recruiting_moves")
    .update({ gmail_sent_at: new Date().toISOString() })
    .eq("id", context.move.id)
    .eq("user_id", user.id)
    .is("gmail_sent_at", null)
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ error: "This message was already sent" }, { status: 409 });
  }

  try {
    const serviceClient = createServiceClient();
    const accessToken = await getValidAccessToken(serviceClient, context.integration.id);
    const mail = await getMailSource();
    const { messageId } = await mail.sendMessage({
      accessToken,
      to: context.recipient,
      subject: context.subject,
      body: context.move.outreach_draft ?? "",
      threadId: context.threadExternalId,
    });

    await supabase
      .from("recruiting_moves")
      .update({
        status: "completed",
        gmail_message_id: messageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", context.move.id)
      .eq("user_id", user.id);

    await supabase.from("move_events").insert({
      move_id: context.move.id,
      user_id: user.id,
      event_type: "sent",
      metadata: { gmail_message_id: messageId },
    });

    logKodaEvent(supabase, user.id, "gmail_message_sent", { move_id: context.move.id });
    return NextResponse.json({ ok: true, messageId });
  } catch (err) {
    console.error("[integrations] gmail send failed:", err);
    // Release the claim: the send did not happen, so a retry must be possible.
    await supabase
      .from("recruiting_moves")
      .update({ gmail_sent_at: null })
      .eq("id", context.move.id)
      .eq("user_id", user.id);
    return NextResponse.json({ error: "Send failed" }, { status: 502 });
  }
}
