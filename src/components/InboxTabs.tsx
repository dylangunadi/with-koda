"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MoveCard } from "@/components/MoveCard";
import { Inbox } from "lucide-react";
import type { RecruitingMove, MoveStatus } from "@/lib/types";

const TAB_CONFIG: { label: string; status: MoveStatus; value: number }[] = [
  { label: "Today", status: "generated", value: 0 },
  { label: "Saved", status: "saved", value: 1 },
  { label: "Sent", status: "sent", value: 2 },
  { label: "Rejected", status: "rejected", value: 3 },
];

function groupMoves(moves: RecruitingMove[]) {
  const groups: Record<MoveStatus, RecruitingMove[]> = {
    generated: [],
    accepted: [],
    saved: [],
    sent: [],
    rejected: [],
    completed: [],
  };
  for (const move of moves) {
    groups[move.status].push(move);
  }
  // Merge accepted into generated for the "Today" tab
  groups.generated = [...groups.generated, ...groups.accepted];
  return groups;
}

function EmptyState({ status }: { status: MoveStatus }) {
  if (status === "generated") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent">
          <Inbox className="size-5 text-accent-foreground" />
        </div>
        <h3 className="font-heading text-lg font-medium">No moves yet</h3>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Koda works best when it knows what you are trying to become. Add your
          target roles and companies, then generate your first recruiting brief.
        </p>
      </div>
    );
  }

  const messages: Record<string, string> = {
    saved: "Moves you save for later will appear here.",
    sent: "Moves you mark as sent will appear here.",
    rejected: "Moves you pass on will appear here.",
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">
        {messages[status] ?? "Nothing here yet."}
      </p>
    </div>
  );
}

export function InboxTabs({ moves }: { moves: RecruitingMove[] }) {
  const grouped = groupMoves(moves);

  return (
    <Tabs defaultValue={0}>
      <TabsList variant="line" className="mb-4">
        {TAB_CONFIG.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {grouped[tab.status].length > 0 && (
              <span className="ml-1.5 inline-flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {grouped[tab.status].length}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {TAB_CONFIG.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {grouped[tab.status].length === 0 ? (
            <EmptyState status={tab.status} />
          ) : (
            <div className="space-y-4">
              {grouped[tab.status].map((move) => (
                <MoveCard key={move.id} move={move} />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
