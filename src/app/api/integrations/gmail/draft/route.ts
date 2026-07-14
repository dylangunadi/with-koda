import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveGmailMoveContext } from "@/lib/koda/integrations/gmailMoveContext";
import { getMailSource, isForcedIntegrationFailure } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { getValidAccessToken } from "@/lib/koda/integrations/tokens";
import { logKodaEvent } from "@/lib/koda/events";

/**
 * Create a Gmail DRAFT from a move's outreach draft, only on this explicit
 * per-move user action. The draft lands in the user's Drafts folder for them
 * to review; sending happens either there or through the separate explicit
 * send route — never automatically.
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

  const context = await resolveGmailMoveContext(supabase, user.id, moveId);
  if (!context.ok) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (isForcedIntegrationFailure(request.headers)) {
    return NextResponse.json({ error: "Draft creation failed" }, { status: 502 });
  }

  try {
    const serviceClient = createServiceClient();
    const accessToken = await getValidAccessToken(serviceClient, context.integration.id);
    const mail = await getMailSource();
    const { draftId } = await mail.createDraft({
      accessToken,
      to: context.recipient,
      subject: context.subject,
      body: context.move.outreach_draft ?? "",
      threadId: context.threadExternalId,
    });

    logKodaEvent(supabase, user.id, "gmail_draft_created", { move_id: context.move.id });
    return NextResponse.json({ ok: true, draftId });
  } catch (err) {
    console.error("[integrations] gmail draft failed:", err);
    return NextResponse.json({ error: "Draft creation failed" }, { status: 502 });
  }
}
