"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, CheckCheck, ChevronDown, ChevronUp, Mail, Save, Bookmark, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { EffortBucket, MoveSourceStatus, MoveType, RecruitingMove } from "@/lib/types";

// Category color lives only in this small text label; cards stay neutral.
const TYPE_TEXT: Record<MoveType, string> = {
  opportunity: "text-teal-700 dark:text-teal-400",
  person_to_contact: "text-blue-700 dark:text-blue-400",
  follow_up: "text-amber-700 dark:text-amber-500",
  proof_of_work: "text-purple-700 dark:text-purple-400",
  application_strategy: "text-emerald-700 dark:text-emerald-400",
};

const TYPE_LABELS: Record<MoveType, string> = {
  opportunity: "Opportunity",
  person_to_contact: "Person to contact",
  follow_up: "Follow up",
  proof_of_work: "Proof of work",
  application_strategy: "Strategy",
};

const EFFORT_LABELS: Record<EffortBucket, string> = {
  quick: "Quick · under 15 min",
  focused: "Focused · 15-45 min",
  project: "Project · multiple sessions",
};

const SOURCE_LABELS: Record<MoveSourceStatus, string> = {
  verified: "Verified source",
  user_provided: "From what you told Koda",
  inferred: "Inferred from your profile",
  ai_suggested: "Koda's suggestion",
};

// Honest freshness: how long ago Koda actually fetched the source. Stale is
// shown as stale, never hidden.
function checkedAgo(fetchedAt: string): string {
  const ms = Date.now() - new Date(fetchedAt).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return "checked just now";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `checked ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `checked ${days}d ago`;
}

export function MoveCard({
  move,
  gmailConnected = false,
}: {
  move: RecruitingMove;
  gmailConnected?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(move.outreach_draft ?? "");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendPreview, setSendPreview] = useState<{
    recipient: string;
    subject: string;
    body: string;
  } | null>(null);
  const [linkedinUrl, setLinkedinUrl] = useState(move.person_linkedin_url ?? "");
  const [note, setNote] = useState(move.connection_note ?? "");
  const [savingLinkedin, setSavingLinkedin] = useState(false);
  const [collecting, setCollecting] = useState<"effort" | "feedback" | null>(null);
  const [feedback, setFeedback] = useState("");
  const router = useRouter();

  const subtitle = [move.company, move.person].filter(Boolean).join(" · ");
  const completed = move.status === "completed" || move.status === "sent";
  const whyNow = move.fit_reason ?? move.expected_outcome;
  const effortLabel = move.effort_bucket
    ? EFFORT_LABELS[move.effort_bucket]
    : move.effort ?? move.follow_up_timing;

  async function patch(payload: Record<string, unknown>, errorMessage: string): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/moves/${move.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      router.refresh();
      return true;
    } catch {
      toast.error(errorMessage);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function complete(actualBucket?: EffortBucket) {
    const ok = await patch(
      { status: "completed", ...(actualBucket ? { actual_effort_bucket: actualBucket } : {}) },
      "Could not update move"
    );
    if (ok) setCollecting(null);
  }

  async function reject(withFeedback: string) {
    const ok = await patch(
      { status: "rejected", ...(withFeedback.trim() ? { feedback: withFeedback.trim() } : {}) },
      "Could not update move"
    );
    if (ok) setCollecting(null);
  }

  // Gmail writes happen only on these explicit clicks. Draft: lands in the
  // user's Drafts folder. Send: opens a confirm dialog whose contents come
  // from the server's dry run, so the user approves exactly what will be
  // sent — deterministic, once, never on Koda's own initiative.
  async function saveDraftIfDirty() {
    if (draft !== move.outreach_draft) {
      await fetch(`/api/moves/${move.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outreach_draft: draft }),
      });
    }
  }

  async function prepareSend() {
    setSending(true);
    try {
      await saveDraftIfDirty();
      const res = await fetch("/api/integrations/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move_id: move.id, dry_run: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not prepare the send.");
        return;
      }
      setSendPreview({ recipient: body.recipient, subject: body.subject, body: body.body });
    } finally {
      setSending(false);
    }
  }

  async function confirmSend() {
    setSending(true);
    try {
      const res = await fetch("/api/integrations/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move_id: move.id }),
      });
      if (res.status === 409) {
        toast.message("Already sent. Refresh to see it.");
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Send failed. Nothing went out.");
        return;
      } else {
        toast.success("Sent from your Gmail.");
      }
      setSendPreview(null);
      router.refresh();
    } finally {
      setSending(false);
    }
  }

  async function createGmailDraft() {
    setCreatingDraft(true);
    try {
      await saveDraftIfDirty();
      const res = await fetch("/api/integrations/gmail/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move_id: move.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not create the Gmail draft.");
        return;
      }
      toast.success("Draft saved to your Gmail. Review and send it there when ready.");
      router.refresh();
    } finally {
      setCreatingDraft(false);
    }
  }

  // LinkedIn outreach is copy-paste only: Koda never connects or messages on
  // LinkedIn. The user pastes the profile URL, copies the text, and acts
  // there themselves.
  async function saveLinkedin() {
    setSavingLinkedin(true);
    try {
      const res = await fetch(`/api/moves/${move.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person_linkedin_url: linkedinUrl.trim(), connection_note: note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not save");
        return;
      }
      toast.success("Saved");
      router.refresh();
    } finally {
      setSavingLinkedin(false);
    }
  }

  async function copyOutreach(field: "note" | "message", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(field === "note" ? "Connection note copied" : "Message copied");
      void fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "linkedin_outreach_copied", properties: { field } }),
      });
    } catch {
      toast.error("Could not copy. Select the text manually.");
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
      if (!res.ok) throw new Error();
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
      {/* Collapsed: the action, why now, effort, one dominant CTA. */}
      <div className="px-5 pt-4 pb-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-[11px] font-semibold uppercase tracking-wider ${TYPE_TEXT[move.type]}`}>
            {TYPE_LABELS[move.type]}
          </span>
          {effortLabel && (
            <span className="font-system text-muted-foreground shrink-0">{effortLabel}</span>
          )}
        </div>

        <h3 className="mt-2 text-base font-heading font-semibold text-foreground leading-snug">
          {move.title}
        </h3>
        {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        {whyNow && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{whyNow}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {!completed && collecting === null && (
            <>
              <Button
                onClick={() => setCollecting("effort")}
                disabled={busy}
                className="h-9 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
              >
                <CheckCheck className="size-4" aria-hidden />
                <span>Mark completed</span>
              </Button>
              {move.status !== "saved" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => patch({ status: "saved" }, "Could not update move")}
                  disabled={busy}
                  className="text-muted-foreground"
                >
                  <Bookmark className="size-4" aria-hidden />
                  <span>Save for later</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCollecting("feedback")}
                disabled={busy}
                className="text-muted-foreground hover:text-red-600"
              >
                <X className="size-4" aria-hidden />
                <span>Not relevant</span>
              </Button>
            </>
          )}

          {completed && (
            <p className="font-system text-muted-foreground flex items-center gap-1.5">
              <Check className="size-3.5" aria-hidden />
              Completed. Koda uses this to shape your next brief.
            </p>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Collapse details" : "Expand details"}
            className="ml-auto flex items-center justify-center size-8 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>

        {/* Completion: collect the real effort bucket to calibrate estimates. */}
        {collecting === "effort" && (
          <div className="mt-3 rounded-lg border border-border bg-background px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Done. How long did it actually take?</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(EFFORT_LABELS) as EffortBucket[]).map((bucket) => (
                <Button
                  key={bucket}
                  variant="outline"
                  size="sm"
                  onClick={() => complete(bucket)}
                  disabled={busy}
                  className="rounded-lg"
                >
                  {EFFORT_LABELS[bucket]}
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={() => complete()} disabled={busy} className="text-muted-foreground">
                Skip
              </Button>
            </div>
          </div>
        )}

        {/* Rejection: optional reason sharpens the next brief. */}
        {collecting === "feedback" && (
          <div className="mt-3 rounded-lg border border-border bg-background px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-foreground">Why is it not relevant? Optional, helps the next brief.</p>
            <div className="flex gap-2">
              <Input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Too generic, wrong company, already did it..."
                aria-label="Why is this move not relevant"
                className="h-9 rounded-lg text-sm"
              />
              <Button size="sm" variant="outline" onClick={() => reject(feedback)} disabled={busy} className="rounded-lg shrink-0">
                Remove move
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCollecting(null)} disabled={busy} className="shrink-0 text-muted-foreground">
                Keep it
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Expanded: reasoning, draft, proof of work, provenance, extras. */}
      {expanded && (
        <div className="border-t border-border/40 px-5 py-4 sm:px-6 space-y-4" style={{ animation: "fadeSlideIn 180ms ease-out" }}>
          {move.suggested_action && (
            <div className="space-y-1">
              <p className="font-system text-muted-foreground">First step</p>
              <p className="text-sm leading-relaxed text-foreground">{move.suggested_action}</p>
            </div>
          )}

          {move.expected_outcome && move.expected_outcome !== whyNow && (
            <div className="space-y-1">
              <p className="font-system text-muted-foreground">Expected outcome</p>
              <p className="text-sm leading-relaxed">{move.expected_outcome}</p>
            </div>
          )}

          {move.outreach_draft && (
            <div className="space-y-2">
              <p className="font-system text-muted-foreground">Outreach draft</p>
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                aria-label="Outreach draft"
                className="text-sm rounded-lg"
              />
              {move.gmail_sent_at ? (
                <p className="font-system text-muted-foreground flex items-center gap-1.5">
                  <Check className="size-3.5" aria-hidden />
                  Sent via Gmail · {new Date(move.gmail_sent_at).toLocaleString()}
                </p>
              ) : (
                <div className="flex justify-end gap-2">
                  {gmailConnected && move.external_thread_id && !completed && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={createGmailDraft}
                        disabled={creatingDraft || sending || !draft.trim()}
                        className="rounded-lg"
                      >
                        <Mail className="size-3.5" aria-hidden />
                        <span>{creatingDraft ? "Creating..." : "Create Gmail draft"}</span>
                      </Button>
                      <Button
                        size="sm"
                        onClick={prepareSend}
                        disabled={sending || creatingDraft || !draft.trim()}
                        className="rounded-lg bg-primary font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
                      >
                        <Send className="size-3.5" aria-hidden />
                        <span>{sending && !sendPreview ? "Preparing..." : "Send via Gmail"}</span>
                      </Button>
                    </>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveDraft}
                    disabled={saving || draft === move.outreach_draft}
                    className="rounded-lg"
                  >
                    <Save className="size-3.5" aria-hidden />
                    <span>{saving ? "Saving..." : "Save draft"}</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {move.type === "person_to_contact" && !completed && (
            <div className="space-y-2">
              <p className="font-system text-muted-foreground">LinkedIn outreach</p>
              <div className="flex gap-2">
                <Input
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="Paste their LinkedIn profile URL"
                  aria-label="LinkedIn profile URL"
                  className="h-9 rounded-lg text-sm"
                />
                {move.person_linkedin_url && (
                  <a
                    href={move.person_linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border px-3 text-sm hover:bg-muted transition-colors"
                  >
                    Open profile ↗
                  </a>
                )}
              </div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                aria-label="LinkedIn connection note"
                placeholder="Connection note (goes with the invite)"
                className="text-sm rounded-lg"
              />
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-system ${note.length > 300 ? "text-red-600" : "text-muted-foreground"}`}
                >
                  {note.length}/300
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyOutreach("note", note)}
                    disabled={!note.trim()}
                    className="text-muted-foreground"
                  >
                    Copy note
                  </Button>
                  {draft.trim() && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyOutreach("message", draft)}
                      className="text-muted-foreground"
                    >
                      Copy message
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveLinkedin}
                    disabled={
                      savingLinkedin ||
                      note.length > 300 ||
                      (linkedinUrl.trim() === (move.person_linkedin_url ?? "") &&
                        note === (move.connection_note ?? ""))
                    }
                    className="rounded-lg"
                  >
                    {savingLinkedin ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
              <p className="font-system text-muted-foreground">
                Koda never connects or messages on LinkedIn. You paste this yourself.
              </p>
            </div>
          )}

          {move.proof_of_work_idea && (
            <div className="space-y-1">
              <p className="font-system text-muted-foreground">Proof of work angle</p>
              <p className="text-sm leading-relaxed">{move.proof_of_work_idea}</p>
            </div>
          )}

          {move.follow_up_timing && (
            <div className="space-y-1">
              <p className="font-system text-muted-foreground">Timing</p>
              <p className="text-sm leading-relaxed">{move.follow_up_timing}</p>
            </div>
          )}

          <Dialog open={sendPreview !== null} onOpenChange={(open) => !open && setSendPreview(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send this reply from your Gmail?</DialogTitle>
                <DialogDescription>
                  Koda will send exactly this text, once, from your Gmail.
                  Nothing else is ever sent without this button.
                </DialogDescription>
              </DialogHeader>
              {sendPreview && (
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="font-system text-muted-foreground">To </span>
                    {sendPreview.recipient}
                  </p>
                  <p>
                    <span className="font-system text-muted-foreground">Subject </span>
                    {sendPreview.subject}
                  </p>
                  <div className="rounded-lg border border-border bg-background px-3 py-2 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                    {sendPreview.body}
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="ghost" onClick={() => setSendPreview(null)} disabled={sending}>
                  Keep editing
                </Button>
                <Button
                  onClick={confirmSend}
                  disabled={sending}
                  className="bg-primary font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
                >
                  {sending ? "Sending..." : "Send via Gmail"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <p className="font-system text-muted-foreground border-t border-border/40 pt-3">
            {move.source_status === "verified" ? (
              <span className="text-teal-700 dark:text-teal-400 font-semibold">
                {SOURCE_LABELS.verified}
              </span>
            ) : (
              SOURCE_LABELS[move.source_status] ?? SOURCE_LABELS.ai_suggested
            )}
            {move.source_note && ` · ${move.source_note}`}
            {move.source_fetched_at && ` · ${checkedAgo(move.source_fetched_at)}`}
            {typeof move.confidence === "number" && ` · ${Math.round(move.confidence * 100)}% fit`}
            {move.source_url && (
              <>
                {" · "}
                <a
                  href={move.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  View source ↗
                </a>
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
