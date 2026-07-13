"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { KodaLogo } from "@/components/KodaLogo";
import { ReviewConfirm } from "@/components/talk/ReviewConfirm";
import { ConfirmationCard } from "@/components/talk/ConfirmationCard";
import type { OngoingProposal } from "@/lib/koda/ai/provider";
import type { OnboardingExtracted } from "@/lib/types";

export interface ChatMessage {
  id?: string;
  role: "user" | "koda";
  content: string;
  streaming?: boolean;
  proposal?: OngoingProposal | null;
  proposalStatus?: "pending" | "applied" | "declined";
}

interface TalkToKodaProps {
  mode: "onboarding" | "ongoing";
  initialMessages: ChatMessage[];
  initialExtracted: OnboardingExtracted;
  initialMissing: string[];
  firstQuestion: string;
  totalFields: number;
  initialAiMode: "live" | "mock";
}

const ONBOARDING_GREETING =
  "Hi, I am Koda. I help you figure out what to pursue, who to talk to, and what to send. A few quick questions so I can be useful, then you get your first brief.";

const ONGOING_GREETING =
  "What happened since we last talked? Tell me about conversations you have had, changes to your goals, or ask me what to do next.";

interface TurnAttempt {
  text: string;
  turnId: string;
}

/**
 * Talk to Koda: a contained chat surface. The page never grows — the
 * transcript is the only scrolling region and follows new messages, while
 * the header and composer stay fixed. Voice calls live on the
 * feat/voice-call-onboarding branch.
 */
export function TalkToKoda({
  mode,
  initialMessages,
  initialExtracted,
  initialMissing,
  firstQuestion,
  initialAiMode,
}: TalkToKodaProps) {
  const router = useRouter();
  const onboarding = mode === "onboarding";
  const resumed = initialMessages.length > 0;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!resumed) {
      return [
        {
          role: "koda",
          content: onboarding ? `${ONBOARDING_GREETING} ${firstQuestion}` : ONGOING_GREETING,
        },
      ];
    }
    const needsPrompt =
      onboarding &&
      initialMissing.length > 0 &&
      initialMessages[initialMessages.length - 1]?.role === "user";
    return needsPrompt
      ? [
          ...initialMessages,
          { role: "koda", content: `Picking up where we left off. ${firstQuestion}` },
        ]
      : initialMessages;
  });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<OnboardingExtracted>(initialExtracted);
  const [missing, setMissing] = useState<string[]>(initialMissing);
  const [done, setDone] = useState(onboarding && initialMissing.length === 0);
  const [aiMode, setAiMode] = useState<string>(initialAiMode);
  const [announcement, setAnnouncement] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRef = useRef(false);
  const lastAttemptRef = useRef<TurnAttempt | null>(null);

  // The transcript follows the conversation so the newest words are always
  // in view without the user (or the page) having to grow and chase them.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, done]);

  const send = useCallback(
    async (rawText: string, retryTurnId?: string) => {
      const text = rawText.trim();
      if (!text || inFlightRef.current || done) return;
      inFlightRef.current = true;
      setSending(true);
      setError(null);

      const turnId = retryTurnId ?? crypto.randomUUID();
      lastAttemptRef.current = { text, turnId };

      // Optimistic: the user's words appear instantly; the composer clears
      // instantly. On failure both are restored.
      setInput("");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "koda", content: "", streaming: true },
      ]);

      let sawFinal = false;
      let failed = false;
      const startedAt = performance.now();
      let firstDeltaAt: number | null = null;

      const failTurn = (message: string) => {
        failed = true;
        // Roll back the streaming placeholder and the optimistic user bubble;
        // the words return to the composer so nothing is lost.
        setMessages((prev) => prev.filter((m) => !m.streaming).slice(0, -1));
        setInput(text);
        setError(message);
        inputRef.current?.focus();
      };

      try {
        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, inputMode: "text", turnId }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          failTurn(data.error ?? "Koda could not process that. Try again.");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamedReply = "";

        const handleEvent = (event: Record<string, unknown>) => {
          if (event.type === "delta" && typeof event.text === "string") {
            if (firstDeltaAt === null) firstDeltaAt = performance.now();
            streamedReply += event.text;
            setMessages((prev) =>
              prev.map((m) => (m.streaming ? { ...m, content: streamedReply } : m))
            );
          } else if (event.type === "final") {
            sawFinal = true;
            const reply = typeof event.reply === "string" ? event.reply : streamedReply;
            setAnnouncement(reply);
            setMessages((prev) =>
              prev.map((m) =>
                m.streaming
                  ? {
                      role: "koda" as const,
                      content: reply,
                      id: (event.proposalMessageId as string) ?? undefined,
                      proposal: (event.proposal as OngoingProposal) ?? undefined,
                      proposalStatus: event.proposal ? ("pending" as const) : undefined,
                    }
                  : m
              )
            );
            if (onboarding) {
              setExtracted((event.extracted as OnboardingExtracted) ?? {});
              setMissing((event.missing as string[]) ?? []);
              if (event.done) setDone(true);
            }
            if (typeof event.aiMode === "string") setAiMode(event.aiMode);

            const totalMs = performance.now() - startedAt;
            fetch("/api/events", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: "turn_latency",
                properties: {
                  first_delta_ms: (firstDeltaAt ?? performance.now()) - startedAt,
                  total_ms: totalMs,
                  mode,
                },
              }),
            }).catch(() => {});
          } else if (event.type === "error") {
            failTurn(
              typeof event.error === "string" ? event.error : "Koda could not process that."
            );
          }
        };

        // Parse the event stream incrementally.
        for (;;) {
          const { done: streamDone, value } = await reader.read();
          if (streamDone) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (line) handleEvent(JSON.parse(line.slice(5)));
          }
        }
        if (!sawFinal && !failed) {
          failTurn("The connection dropped mid-reply. Try again.");
        }
      } catch {
        failTurn("Network problem. Your message is still here, try again.");
      } finally {
        inFlightRef.current = false;
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [done, onboarding, mode]
  );

  const retry = () => {
    const attempt = lastAttemptRef.current;
    if (!attempt) return;
    send(input.trim() || attempt.text, attempt.turnId);
  };


  const userTurns = messages.filter((m) => m.role === "user").length;

  return (
    <div className="h-dvh bg-background relative overflow-hidden flex flex-col">
      <div className="grain fixed inset-0 pointer-events-none" />

      {/* Screen readers hear each completed reply once; a live region on the
          transcript itself would re-announce every streamed word. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <header className="relative z-10 shrink-0 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <KodaLogo size={26} />
            <span className="font-heading text-xl font-bold tracking-tight text-foreground">Koda</span>
          </div>
          <div className="flex items-center gap-3">
            {aiMode === "mock" && (
              <span className="font-system text-muted-foreground" title="No AI key configured; Koda is using its offline sample engine.">
                Offline sample mode
              </span>
            )}
            {onboarding ? (
              <span
                aria-hidden="true"
                className="hidden"
                data-onboarding-remaining={missing.length}
                data-onboarding-done={done ? "1" : "0"}
              />
            ) : (
              <Link
                href="/inbox"
                className="font-system text-muted-foreground hover:text-foreground transition-colors"
              >
                Back to inbox
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Transcript: the only scrolling region; the page never grows. */}
      <div ref={scrollRef} className="relative z-10 flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
          {resumed && onboarding && (
            <p className="font-system text-muted-foreground text-center">
              Resumed. Nothing you said was lost.
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "koda" ? (
              <div key={m.id ?? i} className="max-w-[85%] space-y-3">
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 font-system text-primary">
                    <KodaLogo size={18} className="shrink-0" aria-hidden />
                    Koda
                  </p>
                  <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">
                    {m.content}
                    {m.streaming && <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-primary/40 animate-pulse" aria-hidden />}
                  </p>
                </div>
                {m.proposal && m.id && (
                  <ConfirmationCard
                    messageId={m.id}
                    proposal={m.proposal}
                    initialStatus={m.proposalStatus ?? "pending"}
                  />
                )}
              </div>
            ) : (
              <div key={i} className="max-w-[85%] ml-auto">
                <div className="rounded-xl bg-accent px-4 py-3 text-[15px] leading-relaxed text-accent-foreground whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            )
          )}

        </div>
      </div>

      {/* The end-of-conversation review pops up over the chat so it can
          never be missed at the bottom of a long transcript. */}
      {done && onboarding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Review what Koda learned"
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 backdrop-blur-sm sm:items-center sm:p-6"
        >
          <div className="page-enter w-full max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex justify-end bg-card px-6 pt-4 rounded-t-2xl sm:rounded-t-2xl">
              <button
                type="button"
                onClick={() => setDone(false)}
                className="font-system text-muted-foreground hover:text-foreground transition-colors"
              >
                Keep chatting
              </button>
            </div>
            <ReviewConfirm extracted={extracted} onDone={() => router.push("/inbox?from=talk")} />
          </div>
        </div>
      )}

      {/* Composer: pinned to the bottom, available in every state. */}
      {!done && (
        <div className="relative z-10 shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-2xl px-6 py-3 space-y-3">
            {onboarding && userTurns >= 4 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setDone(true)}
                  className="font-system text-primary underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Wrap up and review what Koda has
                </button>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  disabled={sending}
                  className="shrink-0 font-medium underline underline-offset-2"
                >
                  Retry
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-end gap-3"
            >
              <Textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                placeholder={onboarding ? "Type your answer" : "Tell Koda what happened, or ask what to do next"}
                aria-label="Message Koda"
                rows={1}
                className="min-h-[44px] max-h-32 resize-none rounded-lg text-[15px]"
                autoFocus
              />
              <Button
                type="submit"
                disabled={sending || !input.trim()}
                className="h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
              >
                {sending ? "Sending" : "Send"}
              </Button>
            </form>
            <p className="min-h-4 font-system text-muted-foreground">
              Enter to send. Shift plus Enter for a new line.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
