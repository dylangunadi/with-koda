import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getKodaAI, isForcedFailure, KodaAiError } from "@/lib/koda/ai/provider";
import type { OngoingGrounding, OngoingProposal } from "@/lib/koda/ai/provider";
import { mergeExtracted, missingFields } from "@/lib/koda/onboarding";
import { logKodaEvent } from "@/lib/koda/events";
import type {
  KodaConversation,
  KodaMessage,
  OnboardingExtracted,
  Profile,
} from "@/lib/types";

const MAX_MESSAGE_LENGTH = 4000;
const DUPLICATE_WINDOW_MS = 5000;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * One conversational turn with Koda.
 * Onboarding mode gathers the profile; ongoing mode (once a profile exists)
 * captures relationship context, proposes profile updates, and answers
 * "what should I do next". The user's message is only persisted after the
 * provider produced a reply, so a failed turn never consumes the input.
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

  let body: { message?: unknown; inputMode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 }
    );
  }
  const inputMode = body.inputMode === "voice" ? "voice" : "text";

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileRow) {
    return ongoingTurn(supabase, user.id, profileRow as Profile, message, inputMode, request);
  }
  return onboardingTurn(supabase, user.id, message, inputMode, request);
}

// ---------------------------------------------------------------------------
// Onboarding mode
// ---------------------------------------------------------------------------

async function onboardingTurn(
  supabase: ServerSupabase,
  userId: string,
  message: string,
  inputMode: "text" | "voice",
  request: Request
) {
  // Load or create the active onboarding conversation. The partial unique
  // index makes concurrent creates race-safe: on conflict, re-fetch.
  let conversation = await getConversation(supabase, userId, "onboarding");
  if (!conversation) {
    const { data: created, error: createError } = await supabase
      .from("koda_conversations")
      .insert({ user_id: userId, kind: "onboarding", status: "active" })
      .select()
      .single();
    if (createError) {
      conversation = await getConversation(supabase, userId, "onboarding");
      if (!conversation) {
        return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
      }
    } else {
      conversation = created as KodaConversation;
      logKodaEvent(supabase, userId, "onboarding_started");
    }
  }

  const duplicate = await duplicateGuard(supabase, conversation.id, message);
  if (duplicate) {
    const extracted = conversation.extracted ?? {};
    return NextResponse.json({
      conversationId: conversation.id,
      reply: duplicate.content,
      extracted,
      missing: missingFields(extracted),
      done: missingFields(extracted).length === 0,
      aiMode: (duplicate.payload?.ai_mode as string) ?? "mock",
      duplicate: true,
    });
  }

  const extracted: OnboardingExtracted = conversation.extracted ?? {};
  const missing = missingFields(extracted);
  const history = await loadHistory(supabase, conversation.id);

  let turn;
  let aiMode: string;
  try {
    if (isForcedFailure(new Headers(request.headers))) {
      throw new KodaAiError("Forced test failure");
    }
    const ai = await getKodaAI();
    aiMode = ai.mode;
    turn = await ai.onboardingTurn({ extracted, missing, history, userMessage: message });
  } catch (err) {
    console.error("Talk turn failed:", err);
    logKodaEvent(supabase, userId, "ai_error", { mode: "onboarding" });
    return NextResponse.json(
      { error: "Koda could not process that. Your message is still here, try again.", retryable: true },
      { status: 502 }
    );
  }

  const merged = mergeExtracted(extracted, turn.extracted);
  const remaining = missingFields(merged);
  const done = remaining.length === 0;

  // Persist the turn only after the provider succeeded.
  const { error: userMsgError } = await supabase.from("koda_messages").insert({
    conversation_id: conversation.id,
    user_id: userId,
    role: "user",
    content: message,
    input_mode: inputMode,
    payload: {},
  });
  if (userMsgError) {
    console.error("Failed to persist user message:", userMsgError);
    return NextResponse.json(
      { error: "Could not save your message. Try again.", retryable: true },
      { status: 500 }
    );
  }

  const { error: replyError } = await supabase.from("koda_messages").insert({
    conversation_id: conversation.id,
    user_id: userId,
    role: "koda",
    content: turn.reply,
    input_mode: "text",
    payload: { extraction_delta: turn.extracted, ai_mode: aiMode },
  });

  const { error: convUpdateError } = await supabase
    .from("koda_conversations")
    .update({ extracted: merged, updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // If the reply or the extracted state failed to persist, do not pretend the
  // turn succeeded: reported progress must never regress on reload.
  if (replyError || convUpdateError) {
    console.error("Failed to persist turn:", replyError ?? convUpdateError);
    return NextResponse.json(
      { error: "Could not save Koda's reply. Try again.", retryable: true },
      { status: 500 }
    );
  }

  logKodaEvent(supabase, userId, "onboarding_message_submitted", {
    input_mode: inputMode,
    fields_remaining: remaining.length,
  });
  if (inputMode === "voice") {
    logKodaEvent(supabase, userId, "voice_input_used", { mode: "onboarding" });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    reply: turn.reply,
    extracted: merged,
    missing: remaining,
    done,
    aiMode,
  });
}

// ---------------------------------------------------------------------------
// Ongoing mode
// ---------------------------------------------------------------------------

async function ongoingTurn(
  supabase: ServerSupabase,
  userId: string,
  profile: Profile,
  message: string,
  inputMode: "text" | "voice",
  request: Request
) {
  let conversation = await getConversation(supabase, userId, "ongoing");
  if (!conversation) {
    const { data: created, error: createError } = await supabase
      .from("koda_conversations")
      .insert({ user_id: userId, kind: "ongoing", status: "active" })
      .select()
      .single();
    if (createError || !created) {
      return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
    }
    conversation = created as KodaConversation;
  }

  const duplicate = await duplicateGuard(supabase, conversation.id, message);
  if (duplicate) {
    return NextResponse.json({
      conversationId: conversation.id,
      reply: duplicate.content,
      intent: (duplicate.payload?.intent as string) ?? "chat",
      proposal: (duplicate.payload?.proposal as OngoingProposal) ?? null,
      proposalMessageId:
        duplicate.payload?.proposal_status === "pending" ? duplicate.id : null,
      aiMode: (duplicate.payload?.ai_mode as string) ?? "mock",
      duplicate: true,
    });
  }

  // Grounding data: recent moves and confirmed relationship memory.
  const { data: moveRows } = await supabase
    .from("recruiting_moves")
    .select("title,type,status,company,confidence")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  const { data: relationshipRows } = await supabase
    .from("relationships")
    .select("person_name,organization,context,follow_up_date")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  const history = await loadHistory(supabase, conversation.id);

  let turn;
  let aiMode: string;
  try {
    if (isForcedFailure(new Headers(request.headers))) {
      throw new KodaAiError("Forced test failure");
    }
    const ai = await getKodaAI();
    aiMode = ai.mode;
    turn = await ai.ongoingTurn({
      profile,
      userMessage: message,
      history,
      grounding: {
        recentMoves: (moveRows ?? []) as OngoingGrounding["recentMoves"],
        relationships: (relationshipRows ?? []) as OngoingGrounding["relationships"],
      },
    });
  } catch (err) {
    console.error("Ongoing turn failed:", err);
    logKodaEvent(supabase, userId, "ai_error", { mode: "ongoing" });
    return NextResponse.json(
      { error: "Koda could not process that. Your message is still here, try again.", retryable: true },
      { status: 502 }
    );
  }

  // Fill old values for profile diffs server-side: the model never asserts
  // what the current profile says.
  if (turn.proposal?.profile_diff) {
    turn.proposal.profile_diff = turn.proposal.profile_diff.map((entry) => ({
      ...entry,
      old_value: (profile[entry.field] as string | string[] | null) ?? null,
    }));
  }

  const { data: userMsg, error: userMsgError } = await supabase
    .from("koda_messages")
    .insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: "user",
      content: message,
      input_mode: inputMode,
      payload: {},
    })
    .select()
    .single();
  if (userMsgError || !userMsg) {
    console.error("Failed to persist user message:", userMsgError);
    return NextResponse.json(
      { error: "Could not save your message. Try again.", retryable: true },
      { status: 500 }
    );
  }

  const { data: kodaMsg, error: replyError } = await supabase
    .from("koda_messages")
    .insert({
      conversation_id: conversation.id,
      user_id: userId,
      role: "koda",
      content: turn.reply,
      input_mode: "text",
      payload: {
        intent: turn.intent,
        ai_mode: aiMode,
        ...(turn.proposal
          ? {
              proposal: turn.proposal,
              proposal_status: "pending",
              source_user_message_id: userMsg.id,
              source_user_message: message,
            }
          : {}),
      },
    })
    .select()
    .single();

  const { error: convUpdateError } = await supabase
    .from("koda_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  if (replyError || !kodaMsg || convUpdateError) {
    console.error("Failed to persist turn:", replyError ?? convUpdateError);
    return NextResponse.json(
      { error: "Could not save Koda's reply. Try again.", retryable: true },
      { status: 500 }
    );
  }

  if (inputMode === "voice") {
    logKodaEvent(supabase, userId, "voice_input_used", { mode: "ongoing" });
  }
  if (turn.intent === "ask_next_move") {
    logKodaEvent(supabase, userId, "next_move_requested");
  }
  if (turn.proposal?.profile_diff) {
    logKodaEvent(supabase, userId, "profile_update_proposed", {
      field_count: turn.proposal.profile_diff.length,
    });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    reply: turn.reply,
    intent: turn.intent,
    proposal: turn.proposal ?? null,
    proposalMessageId: turn.proposal ? kodaMsg.id : null,
    aiMode,
  });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getConversation(
  supabase: ServerSupabase,
  userId: string,
  kind: "onboarding" | "ongoing"
): Promise<KodaConversation | null> {
  const { data } = await supabase
    .from("koda_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as KodaConversation) ?? null;
}

/** Identical message inside the window returns the previous reply. */
async function duplicateGuard(
  supabase: ServerSupabase,
  conversationId: string,
  message: string
): Promise<KodaMessage | null> {
  const { data: recent } = await supabase
    .from("koda_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(2);
  const recentMessages = (recent ?? []) as KodaMessage[];
  const lastUser = recentMessages.find((m) => m.role === "user");
  const lastKoda = recentMessages.find((m) => m.role === "koda");
  if (
    lastUser &&
    lastKoda &&
    lastUser.content === message &&
    Date.now() - new Date(lastUser.created_at).getTime() < DUPLICATE_WINDOW_MS
  ) {
    return lastKoda;
  }
  return null;
}

async function loadHistory(supabase: ServerSupabase, conversationId: string) {
  const { data: historyRows } = await supabase
    .from("koda_messages")
    .select("role,content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);
  return ((historyRows ?? []) as { role: "user" | "koda"; content: string }[]).slice(-12);
}
