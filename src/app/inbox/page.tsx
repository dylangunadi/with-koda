export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RecruitingMove } from "@/lib/types";
import { GenerateMovesButton } from "@/components/GenerateMovesButton";
import { InboxTabs } from "@/components/InboxTabs";

export default async function InboxPage() {
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
    .single();

  if (!profile) {
    redirect("/onboarding");
  }

  const { data: moves } = await supabase
    .from("recruiting_moves")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const allMoves = (moves ?? []) as RecruitingMove[];

  return (
    <div className="page-enter space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your Moves</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Today&apos;s recruiting actions, curated by Koda.
          </p>
        </div>
        <GenerateMovesButton />
      </div>

      <InboxTabs moves={allMoves} />
    </div>
  );
}
