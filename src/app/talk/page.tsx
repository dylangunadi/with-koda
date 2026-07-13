export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { missingFields, ONBOARDING_FIELDS } from "@/lib/koda/onboarding";
import { isMockMode } from "@/lib/koda/ai/provider";
import type { OngoingProposal } from "@/lib/koda/ai/provider";
import { logKodaEvent } from "@/lib/koda/events";
import { TalkToKoda, type ChatMessage } from "@/components/talk/TalkToKoda";
import type { KodaConversation, KodaMessage, OnboardingExtracted } from "@/lib/types";

export default async function TalkPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const kind = profile ? "ongoing" : "onboarding";

  const { data: conversation } = await supabase
    .from("koda_conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let messages: KodaMessage[] = [];
  let extracted: OnboardingExtracted = {};
  if (conversation) {
    extracted = (conversation as KodaConversation).extracted ?? {};
    // Most recent 100, oldest-first for display (ascending with a limit would
    // truncate the newest turns of a long conversation).
    const { data: messageRows } = await supabase
      .from("koda_messages")
      .select("*")
      .eq("conversation_id", (conversation as KodaConversation).id)
      .order("created_at", { ascending: false })
      .limit(100);
    messages = ((messageRows ?? []) as KodaMessage[]).reverse();
  }

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    proposal: (m.payload?.proposal as OngoingProposal) ?? undefined,
    proposalStatus:
      (m.payload?.proposal_status as "pending" | "applied" | "declined") ?? undefined,
  }));

  if (profile) {
    logKodaEvent(supabase, user.id, "talk_to_koda_reopened", {
      has_history: chatMessages.length > 0,
    });
    return (
      <TalkToKoda
        mode="ongoing"
        initialMessages={chatMessages}
        initialExtracted={{}}
        initialMissing={[]}
        firstQuestion=""
        totalFields={0}
        initialAiMode={isMockMode() ? "mock" : "live"}
        voiceMode={process.env.OPENAI_API_KEY ? "cloud" : "browser"}
      />
    );
  }

  const missing = missingFields(extracted);
  const firstQuestion =
    ONBOARDING_FIELDS.find((f) => f.key === missing[0])?.question ??
    "Tell me what you are working toward.";

  if (chatMessages.length > 0) {
    logKodaEvent(supabase, user.id, "onboarding_resumed", {
      fields_remaining: missing.length,
    });
  }

  return (
    <TalkToKoda
      mode="onboarding"
      initialMessages={chatMessages}
      initialExtracted={extracted}
      initialMissing={missing}
      firstQuestion={firstQuestion}
      totalFields={ONBOARDING_FIELDS.length}
      initialAiMode={isMockMode() ? "mock" : "live"}
      voiceMode={process.env.OPENAI_API_KEY ? "cloud" : "browser"}
    />
  );
}
