import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { UPDATABLE_PROFILE_FIELDS } from "@/lib/koda/ai/provider";
import type { OngoingProposal, ProfileDiffEntry } from "@/lib/koda/ai/provider";
import { logKodaEvent } from "@/lib/koda/events";
import type { KodaMessage } from "@/lib/types";

/**
 * Resolve a pending conversation proposal.
 * Nothing is written to relationships or the profile until the user confirms
 * here; declining records the resolution and writes nothing else.
 * Resolution is idempotent: a proposal can only move out of 'pending' once.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messageId?: unknown; accept?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const accept = body.accept === true;
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  // RLS scopes this to the caller's own messages.
  const { data: messageRow } = await supabase
    .from("koda_messages")
    .select("*")
    .eq("id", messageId)
    .eq("role", "koda")
    .maybeSingle();
  const message = messageRow as KodaMessage | null;
  const proposal = message?.payload?.proposal as OngoingProposal | undefined;
  if (!message || !proposal) {
    return NextResponse.json({ error: "No proposal found" }, { status: 404 });
  }
  if (message.payload.proposal_status !== "pending") {
    // Already resolved: idempotent no-op reporting the prior outcome.
    return NextResponse.json({
      applied: message.payload.proposal_status === "applied",
      alreadyResolved: true,
    });
  }

  if (!accept) {
    await resolveProposal(supabase, messageId, message, "declined");
    if (proposal.relationships) {
      logKodaEvent(supabase, user.id, "context_declined");
    }
    return NextResponse.json({ applied: false });
  }

  // Apply relationship memory: original user words preserved verbatim.
  if (proposal.relationships?.length) {
    const sourceMessage = (message.payload.source_user_message as string) ?? null;
    const sourceMessageId = (message.payload.source_user_message_id as string) ?? null;
    const rows = proposal.relationships.map((r) => ({
      user_id: user.id,
      person_name: r.person_name,
      organization: r.organization,
      role_title: r.role_title,
      context: r.context,
      source_message: sourceMessage,
      source_message_id: sourceMessageId,
      interaction_date: r.interaction_date,
      follow_up_date: r.follow_up_date,
    }));
    const { error: insertError } = await supabase.from("relationships").insert(rows);
    if (insertError) {
      console.error("Failed to save relationships:", insertError);
      return NextResponse.json(
        { error: "Could not save that. Try again.", retryable: true },
        { status: 500 }
      );
    }
    logKodaEvent(supabase, user.id, "context_added", {
      relationship_count: rows.length,
      has_follow_up: rows.some((r) => r.follow_up_date !== null),
    });
  }

  // Apply profile updates: whitelisted fields only.
  if (proposal.profile_diff?.length) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const applied: string[] = [];
    for (const entry of proposal.profile_diff as ProfileDiffEntry[]) {
      if (!UPDATABLE_PROFILE_FIELDS.includes(entry.field)) continue;
      updates[entry.field] = entry.new_value;
      applied.push(entry.field);
    }
    if (applied.length) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id);
      if (updateError) {
        console.error("Failed to update profile:", updateError);
        return NextResponse.json(
          { error: "Could not update your profile. Try again.", retryable: true },
          { status: 500 }
        );
      }
      logKodaEvent(supabase, user.id, "profile_updated", {
        field_count: applied.length,
        fields: applied.join(","),
      });
    }
  }

  await resolveProposal(supabase, messageId, message, "applied");
  return NextResponse.json({ applied: true });
}

async function resolveProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  messageId: string,
  message: KodaMessage,
  status: "applied" | "declined"
) {
  const { error } = await supabase
    .from("koda_messages")
    .update({ payload: { ...message.payload, proposal_status: status } })
    .eq("id", messageId);
  if (error) console.error("Failed to resolve proposal:", error);
}
