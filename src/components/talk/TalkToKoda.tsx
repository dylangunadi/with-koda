"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Phone, PhoneOff, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReviewConfirm } from "@/components/talk/ReviewConfirm";
import { ConfirmationCard } from "@/components/talk/ConfirmationCard";
import { useCallMachine, type CallStatus } from "@/components/talk/useCallMachine";
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

const STATE_LABELS: Partial<Record<CallStatus, string>> = {
  connecting: "Connecting",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Koda is speaking",
  network_error: "Connection trouble",
  recognition_error: "Could not hear that",
};

interface TurnAttempt {
  text: string;
  turnId: string;
  voice: boolean;
}

export function TalkToKoda({
  mode,
  initialMessages,
  initialExtracted,
  initialMissing,
  firstQuestion,
  totalFields,
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
  const [inputHint, setInputHint] = useState<string | null>(null);
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

  const sendRef = useRef<(text: string, voice: boolean, retryTurnId?: string) => void>(() => {});

  const call = useCallMachine({
    onTurnReady: (text, { lowConfidence }) => {
      if (lowConfidence || inFlightRef.current) {
        // Low confidence: let the user correct what was heard before it goes
        // anywhere. Turn still in flight (they interrupted and kept talking):
        // never drop their words silently; hand them to the composer.
        setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${text}` : text));
        setInputHint(
          inFlightRef.current
            ? "Koda was still answering. Send this when you are ready."
            : "Check what Koda heard, then send."
        );
        inputRef.current?.focus();
        return;
      }
      sendRef.current(text, true);
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, done, call.status]);

  const send = useCallback(
    async (rawText: string, voice: boolean, retryTurnId?: string) => {
      const text = rawText.trim();
      if (!text || inFlightRef.current || done) return;
      inFlightRef.current = true;
      setSending(true);
      setError(null);
      setInputHint(null);

      const turnId = retryTurnId ?? crypto.randomUUID();
      lastAttemptRef.current = { text, turnId, voice };

      // Optimistic: the user's words appear instantly; the composer clears
      // instantly. On failure both are restored.
      if (!voice) setInput("");
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "koda", content: "", streaming: true },
      ]);
      call.beginProcessing();

      const startedAt = performance.now();
      let firstDeltaAt: number | null = null;
      let sawFinal = false;
      let failed = false;

      const failTurn = (message: string, kind: "ai_error" | "network_error") => {
        failed = true;
        // Roll back the streaming placeholder and the optimistic user bubble;
        // the words return to the composer so nothing is lost.
        setMessages((prev) => prev.filter((m) => !m.streaming).slice(0, -1));
        setInput(text);
        setError(message);
        call.failTurn(kind);
        inputRef.current?.focus();
      };

      try {
        const res = await fetch("/api/talk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, inputMode: voice ? "voice" : "text", turnId }),
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          failTurn(data.error ?? "Koda could not process that. Try again.", "ai_error");
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
            call.speakDelta(event.text);
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
              if (event.done) {
                setDone(true);
                // Wind down: the mic stops now, the spoken summary finishes
                // (finishTurn below drains it), then the call ends on its own.
                call.windDown();
              }
            }
            if (typeof event.aiMode === "string") setAiMode(event.aiMode);
            call.finishTurn();

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
              typeof event.error === "string" ? event.error : "Koda could not process that.",
              "ai_error"
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
          failTurn("The connection dropped mid-reply. Try again.", "network_error");
        }
      } catch {
        failTurn("Network problem. Your message is still here, try again.", "network_error");
      } finally {
        inFlightRef.current = false;
        setSending(false);
        if (!voice) inputRef.current?.focus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done, onboarding, mode, call.beginProcessing, call.speakDelta, call.finishTurn, call.failTurn, call.windDown]
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const retry = () => {
    const attempt = lastAttemptRef.current;
    if (!attempt) return;
    call.resumeListening();
    send(input.trim() || attempt.text, attempt.voice, attempt.turnId);
  };

  const answered = totalFields - missing.length;
  const inCall = call.callActive;
  const stateLabel = call.muted && inCall ? "Muted" : STATE_LABELS[call.status];

  return (
    <div className="h-dvh bg-background relative overflow-hidden flex flex-col">
      <div className="grain fixed inset-0 pointer-events-none" />

      <header className="relative z-10 shrink-0 border-b border-border/40 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="status-dot" />
            <span className="font-heading text-xl font-bold tracking-tight text-foreground">Koda</span>
          </div>
          <div className="flex items-center gap-3">
            {aiMode === "mock" && (
              <span className="font-system text-muted-foreground" title="No AI key configured; Koda is using its offline sample engine.">
                Offline sample mode
              </span>
            )}
            {onboarding ? (
              <span className="font-system text-primary">
                {done ? "Review" : `${answered} of ${totalFields} covered`}
              </span>
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

      {/* Screen readers hear each completed reply once; a live region on the
          transcript itself would re-announce every streamed word. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

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
                  <p className="font-system text-primary mb-1.5">Koda</p>
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
          {inCall && call.interim && (
            <div className="max-w-[85%] ml-auto">
              <div className="rounded-xl border border-dashed border-primary/40 px-4 py-3 text-[15px] leading-relaxed text-muted-foreground italic">
                {call.interim}
              </div>
            </div>
          )}
          {done && onboarding && (
            <ReviewConfirm extracted={extracted} onDone={() => router.push("/inbox?from=talk")} />
          )}
        </div>
      </div>

      {/* Persistent controls. Text input stays available in every state. */}
      {!done && (
        <div className="relative z-10 shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-2xl px-6 py-3 space-y-3">
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
            {call.status === "permission_denied" && (
              <p role="alert" className="font-system text-destructive">
                Microphone is blocked. Keep typing, or allow the mic in your browser settings.
              </p>
            )}

            {/* Call controls */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2" aria-live="polite">
                {call.micActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-system text-accent-foreground">
                    <span className="status-dot" aria-hidden />
                    Mic on
                  </span>
                )}
                {inCall && stateLabel && (
                  <span className="font-system text-primary">{stateLabel}</span>
                )}
                {inCall && call.status === "network_error" && (
                  <button
                    type="button"
                    onClick={call.reconnect}
                    className="font-system text-primary underline underline-offset-2"
                  >
                    Reconnect
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {call.supported && !inCall && call.status !== "permission_denied" && (
                  <Button
                    type="button"
                    onClick={call.startCall}
                    className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
                  >
                    <Phone className="size-4" aria-hidden />
                    <span>{call.status === "ended" ? "Call again" : "Start call"}</span>
                  </Button>
                )}
                {inCall && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={call.toggleMute}
                      aria-pressed={call.muted}
                      className="h-10 rounded-full px-4"
                    >
                      {call.muted ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                      <span>{call.muted ? "Unmute" : "Mute"}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        call.endCall();
                        inputRef.current?.focus();
                      }}
                      className="h-10 rounded-full px-4"
                    >
                      <Keyboard className="size-4" aria-hidden />
                      <span>Switch to text</span>
                    </Button>
                    <Button
                      type="button"
                      onClick={call.endCall}
                      className="h-10 rounded-full bg-destructive/10 px-4 font-semibold text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                    >
                      <PhoneOff className="size-4" aria-hidden />
                      <span>End call</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Composer: the text path is always available. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input, false);
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
                    send(input, false);
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
              {inputHint ?? "Enter to send. Shift plus Enter for a new line."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
