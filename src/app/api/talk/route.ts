import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getKodaAI, isForcedFailure, KodaAiError } from "@/lib/koda/ai/provider";
import { mergeExtracted, missingFields } from "@/lib/koda/onboarding";
import type { KodaConversation, KodaMessage, OnboardingExtracted } from "@/lib/types";

const MAX_MESSAGE_LENGTH = 4000;
const DUPLICATE_WINDOW_MS = 5000;

/**
 * One conversational turn with Koda.
 * Tier 1 scope: onboarding mode. The user's message is only persisted after
 * the provider produced a reply, so a failed turn never consumes the input —
 * the client keeps it in the composer and can retry.
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

  // Load or create the active onboarding conversation. The partial unique
  // index makes concurrent creates race-safe: on conflict, re-fetch.
  let conversation = await getActiveOnboarding(supabase, user.id);
  if (!conversation) {
    const { data: created, error: createError } = await supabase
      .from("koda_conversations")
      .insert({ user_id: user.id, kind: "onboarding", status: "active" })
      .select()
      .single();
    if (createError) {
      conversation = await getActiveOnboarding(supabase, user.id);
      if (!conversation) {
        return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
      }
    } else {
      conversation = created as KodaConversation;
    }
  }

  // Duplicate-submission guard: an identical message inside the window gets
  // the previous reply back instead of creating a second turn.
  const { data: recent } = await supabase
    .from("koda_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
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
    const extracted = conversation.extracted ?? {};
    return NextResponse.json({
      conversationId: conversation.id,
      reply: lastKoda.content,
      extracted,
      missing: missingFields(extracted),
      done: missingFields(extracted).length === 0,
      aiMode: (lastKoda.payload?.ai_mode as string) ?? "mock",
      duplicate: true,
    });
  }

  const extracted: OnboardingExtracted = conversation.extracted ?? {};
  const missing = missingFields(extracted);

  // History for the provider (oldest first, capped).
  const { data: historyRows } = await supabase
    .from("koda_messages")
    .select("role,content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(30);
  const history = ((historyRows ?? []) as { role: "user" | "koda"; content: string }[]).slice(-12);

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
    user_id: user.id,
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
    user_id: user.id,
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

  return NextResponse.json({
    conversationId: conversation.id,
    reply: turn.reply,
    extracted: merged,
    missing: remaining,
    done,
    aiMode,
  });
}

async function getActiveOnboarding(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<KodaConversation | null> {
  const { data } = await supabase
    .from("koda_conversations")
    .select("*")
    .eq("user_id", userId)
    .eq("kind", "onboarding")
    .eq("status", "active")
    .maybeSingle();
  return (data as KodaConversation) ?? null;
}
