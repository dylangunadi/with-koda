"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { OngoingProposal } from "@/lib/koda/ai/provider";

interface ConfirmationCardProps {
  messageId: string;
  proposal: OngoingProposal;
  initialStatus: "pending" | "applied" | "declined";
  onResolved?: (applied: boolean) => void;
}

function formatValue(value: string | string[] | null | undefined): string {
  if (value == null) return "not set";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "not set";
  return value || "not set";
}

/**
 * Renders a pending conversation proposal (relationship memory or profile
 * changes). Nothing is saved until the user confirms here.
 */
export function ConfirmationCard({
  messageId,
  proposal,
  initialStatus,
  onResolved,
}: ConfirmationCardProps) {
  const [status, setStatus] = useState(initialStatus);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(accept: boolean) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/talk/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, accept }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save that. Try again.");
        return;
      }
      setStatus(data.applied ? "applied" : "declined");
      onResolved?.(data.applied);
    } catch {
      setError("Network problem. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
      <p className="font-system text-primary">
        {proposal.relationships ? "Save to memory?" : "Update your profile?"}
      </p>

      {proposal.relationships?.map((r, i) => (
        <div key={i} className="space-y-0.5 text-sm">
          <p className="font-medium text-foreground">
            {r.person_name}
            {r.role_title ? `, ${r.role_title}` : ""}
            {r.organization ? ` at ${r.organization}` : ""}
          </p>
          {r.context && <p className="text-muted-foreground">{r.context}</p>}
          <p className="text-xs text-muted-foreground">
            {r.interaction_date && `Talked ${r.interaction_date}. `}
            {r.follow_up_date && `Follow up around ${r.follow_up_date}.`}
          </p>
        </div>
      ))}

      {proposal.profile_diff?.map((d, i) => (
        <div key={i} className="text-sm">
          <p className="font-medium text-foreground capitalize">{d.field.replace(/_/g, " ")}</p>
          <p className="text-muted-foreground">
            <span className="line-through decoration-muted-foreground/50">
              {formatValue(d.old_value)}
            </span>
            {"  ->  "}
            <span className="text-foreground">{formatValue(d.new_value)}</span>
          </p>
        </div>
      ))}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {status === "pending" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => resolve(true)}
            disabled={submitting}
            className="rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-[#075B59]"
          >
            {submitting ? "Saving..." : "Confirm"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => resolve(false)}
            disabled={submitting}
            className="rounded-lg"
          >
            Not now
          </Button>
        </div>
      ) : (
        <p className="font-system text-muted-foreground">
          {status === "applied" ? "Saved. Future briefs use this." : "Not saved."}
        </p>
      )}
    </div>
  );
}
