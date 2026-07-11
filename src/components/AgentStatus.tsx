"use client";

import { useState, useEffect } from "react";

const STAGES = [
  { text: "Preparing your brief", duration: 1600 },
  { text: "Reviewing your goals", duration: 1400 },
  { text: "3 moves ready", duration: 0 },
];

export function AgentStatus() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (stage < STAGES.length - 1) {
      const timer = setTimeout(
        () => setStage((s) => s + 1),
        STAGES[stage].duration
      );
      return () => clearTimeout(timer);
    }
  }, [stage]);

  const current = STAGES[stage];
  const isComplete = stage === STAGES.length - 1;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2 border-b border-border/40 bg-secondary/30"
      style={{ animation: "fadeIn 300ms ease-out" }}
    >
      {isComplete ? (
        <div className="status-dot" />
      ) : (
        <div className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
      )}
      <span
        className={`font-system ${
          isComplete
            ? "text-primary"
            : "text-muted-foreground"
        }`}
      >
        {isComplete && (
          <span className="text-muted-foreground/60">Prepared at 7:42 AM &middot; </span>
        )}
        {current.text}
        {!isComplete && (
          <span className="inline-flex w-[18px]">
            <span className="animate-pulse">&hellip;</span>
          </span>
        )}
      </span>
    </div>
  );
}
