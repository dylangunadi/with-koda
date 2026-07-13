export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isRecent } from "@/lib/utils";
import type { Brief, RecruitingMove } from "@/lib/types";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { GenerateMovesButton } from "@/components/GenerateMovesButton";
import { InboxTabs } from "@/components/InboxTabs";
import { BriefHeader } from "@/components/BriefHeader";
import { MessageCircle } from "lucide-react";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, recruiting_stage, integrations_prompt_dismissed_at")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/talk");
  }

  // Recommend the calendar integration only after the first brief exists,
  // only while unconnected, and never again once dismissed. The integrations
  // lookup is skipped entirely once dismissed.
  const [{ data: moves }, { data: latestBrief }, calendarIntegration] = await Promise.all([
    supabase
      .from("recruiting_moves")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("briefs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    profile.integrations_prompt_dismissed_at
      ? Promise.resolve(true)
      : supabase
          .from("integrations")
          .select("id")
          .eq("user_id", user.id)
          .eq("provider", "google_calendar")
          .maybeSingle()
          .then((r) => Boolean(r.data)),
  ]);

  const showConnectPrompt =
    !calendarIntegration && !profile.integrations_prompt_dismissed_at;

  const allMoves = (moves ?? []) as RecruitingMove[];
  const brief = latestBrief as Brief | null;
  const briefMoveCount = brief
    ? allMoves.filter((m) => m.brief_id === brief.id).length
    : 0;
  // "just now" must be true: the ?from=talk param survives bookmarks and
  // reloads long after the conversation, so gate the banner on brief age.
  const briefIsFresh = brief !== null && isRecent(brief.created_at);

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-system text-primary mb-2">Agent inbox</p>
          <h1 className="text-2xl font-heading font-bold tracking-tight text-foreground">Your Moves</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Today&apos;s recruiting actions, curated by Koda.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/talk"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[#075B59]"
          >
            <MessageCircle className="size-4" />
            Talk to Koda
          </Link>
          <GenerateMovesButton />
        </div>
      </div>

      {from === "talk" && briefIsFresh && (
        <p className="font-system text-primary">
          Built from your conversation just now. Three moves, ready to act on.
        </p>
      )}

      {showConnectPrompt && brief && (
        <ConnectPrompt recruitingStage={profile.recruiting_stage ?? null} />
      )}

      {brief && briefMoveCount > 0 && (
        <BriefHeader brief={brief} moveCount={briefMoveCount} />
      )}

      <InboxTabs moves={allMoves} />
    </div>
  );
}
