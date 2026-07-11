"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Check,
  X,
  Bookmark,
  Send,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import type { RecruitingMove, MoveStatus, MoveType } from "@/lib/types";

const TYPE_STYLES: Record<MoveType, string> = {
  opportunity: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  person_to_contact: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  follow_up: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  proof_of_work: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  application_strategy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const TYPE_LABELS: Record<MoveType, string> = {
  opportunity: "Opportunity",
  person_to_contact: "Person to Contact",
  follow_up: "Follow Up",
  proof_of_work: "Proof of Work",
  application_strategy: "Application Strategy",
};

export function MoveCard({ move }: { move: RecruitingMove }) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(move.outreach_draft ?? "");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const router = useRouter();

  const subtitle = [move.company, move.person].filter(Boolean).join(" · ");

  async function updateStatus(status: MoveStatus) {
    setActionLoading(status);
    try {
      const res = await fetch(`/api/moves/${move.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      router.refresh();
    } catch {
      toast.error("Could not update move");
    } finally {
      setActionLoading(null);
    }
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch(`/api/moves/${move.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreach_draft: draft }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Draft saved");
      router.refresh();
    } catch {
      toast.error("Could not save draft");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm move-card overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2 min-w-0">
            <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TYPE_STYLES[move.type]}`}>
              {TYPE_LABELS[move.type]}
            </span>
            <h3 className="text-base font-heading font-semibold text-foreground leading-snug">
              {move.title}
            </h3>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse details" : "Expand details"}
            className="shrink-0 flex items-center justify-center size-8 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-3 sm:px-6 space-y-2">
        {move.fit_reason && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {move.fit_reason}
          </p>
        )}

        {move.suggested_action && (
          <p className="text-sm font-medium text-foreground">
            {move.suggested_action}
          </p>
        )}

        {move.source_note && (
          <p className="text-xs italic text-primary/70">
            Why this move: {move.source_note}
          </p>
        )}

        {expanded && (
          <div className="space-y-4 border-t border-border/40 pt-4 mt-3" style={{ animation: "fadeSlideIn 180ms ease-out" }}>
            {move.outreach_draft && (
              <div className="space-y-2">
                <label className="font-system text-muted-foreground">
                  Outreach Draft
                </label>
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  className="text-sm rounded-lg"
                />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveDraft}
                    disabled={saving || draft === move.outreach_draft}
                    className="rounded-lg"
                  >
                    <Save className="size-3.5" />
                    <span>{saving ? "Saving..." : "Save draft"}</span>
                  </Button>
                </div>
              </div>
            )}

            {move.proof_of_work_idea && (
              <div className="space-y-1">
                <label className="font-system text-muted-foreground">
                  Proof of Work Idea
                </label>
                <p className="text-sm leading-relaxed">{move.proof_of_work_idea}</p>
              </div>
            )}

            {move.follow_up_timing && (
              <div className="space-y-1">
                <label className="font-system text-muted-foreground">
                  Follow-up Timing
                </label>
                <p className="text-sm leading-relaxed">{move.follow_up_timing}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-1 border-t border-border/40 px-4 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateStatus("accepted")}
          disabled={actionLoading !== null}
          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
        >
          <Check className="size-4" />
          <span>Accept</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateStatus("rejected")}
          disabled={actionLoading !== null}
          className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
        >
          <X className="size-4" />
          <span>Reject</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateStatus("saved")}
          disabled={actionLoading !== null}
        >
          <Bookmark className="size-4" />
          <span>Save</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => updateStatus("sent")}
          disabled={actionLoading !== null}
          className="text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
        >
          <Send className="size-4" />
          <span>Sent</span>
        </Button>
      </div>
    </div>
  );
}
