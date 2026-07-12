export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { missingFields, ONBOARDING_FIELDS } from "@/lib/koda/onboarding";
import { TalkToKoda } from "@/components/talk/TalkToKoda";
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

  if (profile) {
    // Already onboarded: the inbox is home base.
    redirect("/inbox");
  }

  // Resume any in-progress onboarding conversation.
  const { data: conversation } = await supabase
    .from("koda_conversations")
    .select("*")
    .eq("user_id", user.id)
    .eq("kind", "onboarding")
    .eq("status", "active")
    .maybeSingle();

  let messages: KodaMessage[] = [];
  let extracted: OnboardingExtracted = {};
  if (conversation) {
    extracted = (conversation as KodaConversation).extracted ?? {};
    const { data: messageRows } = await supabase
      .from("koda_messages")
      .select("*")
      .eq("conversation_id", (conversation as KodaConversation).id)
      .order("created_at", { ascending: true })
      .limit(100);
    messages = (messageRows ?? []) as KodaMessage[];
  }

  const missing = missingFields(extracted);
  const firstQuestion =
    ONBOARDING_FIELDS.find((f) => f.key === missing[0])?.question ??
    "Tell me what you are working toward.";

  return (
    <TalkToKoda
      initialMessages={messages.map((m) => ({ role: m.role, content: m.content }))}
      initialExtracted={extracted}
      initialMissing={missing}
      firstQuestion={firstQuestion}
      totalFields={ONBOARDING_FIELDS.length}
    />
  );
}
