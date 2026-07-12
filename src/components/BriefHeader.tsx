import type { Brief } from "@/lib/types";

const SOURCE_LABELS: Record<Brief["source"], string> = {
  onboarding: "First brief",
  manual: "On demand",
  scheduled: "Scheduled",
};

export function BriefHeader({ brief, moveCount }: { brief: Brief; moveCount: number }) {
  const date = new Date(brief.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  return (
    <div className="flex items-baseline justify-between border-b border-border/60 pb-3">
      <div className="flex items-baseline gap-3">
        <span className="font-system text-primary">Koda Brief</span>
        <span className="text-sm text-muted-foreground">
          {date} · {SOURCE_LABELS[brief.source] ?? brief.source}
        </span>
      </div>
      <span className="font-system text-muted-foreground">
        {moveCount} {moveCount === 1 ? "move" : "moves"}
      </span>
    </div>
  );
}
