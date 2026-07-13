"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mic, MicOff, Phone, PhoneOff, Keyboard, ChevronUp, ChevronDown } from "lucide-react";
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
  voiceMode: "cloud" | "browser";
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
  ai_error: "Koda had trouble replying",
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
  voiceMode,
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
  const [panelOpen, setPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const inFlightRef = useRef(false);
  const lastAttemptRef = useRef<TurnAttempt | null>(null);

  const sendRef = useRef<(text: string, voice: boolean, retryTurnId?: string) => void>(() => {});

  const call = useCallMachine(
    {
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
          // Corrections need the composer: surface it during a call.
          setPanelOpen(true);
          inputRef.current?.focus();
          return;
        }
        sendRef.current(text, true);
      },
    },
    { cloudTts: voiceMode === "cloud" }
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, done, call.status, panelOpen]);


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
        setPanelOpen(true); // the recovery lives in the composer
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
  const orbState = call.muted
    ? "muted"
    : call.status === "listening" || call.status === "connecting"
      ? "listening"
      : call.status === "processing"
        ? "processing"
        : call.status === "speaking"
          ? "speaking"
          : "error";

  const header = (
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
  );

  const errorBanner = error && (
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
  );

  const permissionAlert = call.status === "permission_denied" && (
    <p role="alert" className="font-system text-destructive">
      Microphone is blocked. Keep typing, or allow the mic in your browser settings.
    </p>
  );

  const composer = (
    <>
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
          autoFocus={!inCall}
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
    </>
  );

  const transcript = (
    <div className="space-y-6">
      {resumed && onboarding && !inCall && (
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
      {done && onboarding && (
        <ReviewConfirm extracted={extracted} onDone={() => router.push("/inbox?from=talk")} />
      )}
    </div>
  );

  return (
    <div className="h-dvh bg-background relative overflow-hidden flex flex-col">
      <div className="grain fixed inset-0 pointer-events-none" />

      {/* Screen readers hear each completed reply once; a live region on the
          transcript itself would re-announce every streamed word. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {header}

      {inCall ? (
        /* ---------------- Call surface: a call, not a chat ---------------- */
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-6 px-6">
            <button
              type="button"
              className="call-orb"
              data-state={orbState}
              onClick={call.interrupt}
              aria-label={
                call.status === "speaking"
                  ? "Interrupt Koda"
                  : `Call status: ${stateLabel ?? "in call"}`
              }
            />
            <div className="flex flex-col items-center gap-1.5 text-center" aria-live="polite">
              <div className="flex items-center gap-2">
                {call.micActive && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 font-system text-accent-foreground">
                    <span className="status-dot" aria-hidden />
                    Mic on
                  </span>
                )}
                {stateLabel && <span className="font-system text-primary">{stateLabel}</span>}
                {!call.muted && call.status === "network_error" && (
                  <button
                    type="button"
                    onClick={call.reconnect}
                    className="font-system text-primary underline underline-offset-2"
                  >
                    Reconnect
                  </button>
                )}
              </div>
              {call.status === "speaking" && (
                <p className="font-system text-muted-foreground">Tap the circle to interrupt</p>
              )}
              {call.interim && (
                <p className="max-w-md text-[15px] italic leading-relaxed text-muted-foreground">
                  {call.interim}
                </p>
              )}
            </div>
          </div>

          {/* Call controls */}
          <div className="shrink-0 flex items-center justify-center gap-4 px-6 pb-4">
            <Button
              type="button"
              variant="outline"
              onClick={call.toggleMute}
              aria-pressed={call.muted}
              aria-label={call.muted ? "Unmute microphone" : "Mute microphone"}
              className="h-12 w-12 rounded-full p-0"
            >
              {call.muted ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
            </Button>
            <Button
              type="button"
              onClick={call.endCall}
              aria-label="End call"
              className="h-14 w-14 rounded-full bg-destructive/10 p-0 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
            >
              <PhoneOff className="size-6" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                call.endCall();
                setPanelOpen(true);
                inputRef.current?.focus();
              }}
              aria-label="Switch to text"
              className="h-12 w-12 rounded-full p-0"
            >
              <Keyboard className="size-5" aria-hidden />
            </Button>
          </div>

          {/* Conversation panel: demoted during a call, one tap away */}
          <div className="relative z-10 shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto max-w-2xl px-6 py-2 space-y-3">
              {errorBanner}
              {permissionAlert}
              <button
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                aria-expanded={panelOpen}
                className="flex h-11 w-full items-center justify-center gap-1.5 font-system text-muted-foreground hover:text-foreground transition-colors"
              >
                {panelOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronUp className="size-4" aria-hidden />}
                {panelOpen ? "Hide conversation" : "Show conversation"}
              </button>
              {panelOpen && (
                <div className="space-y-3">
                  <div ref={scrollRef} className="max-h-[30dvh] overflow-y-auto pr-1">
                    {transcript}
                  </div>
                  {composer}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ---------------- Text surface: the chat layout ---------------- */
        <>
          <div ref={scrollRef} className="relative z-10 flex-1 min-h-0 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-6 py-8">{transcript}</div>
          </div>

          {!done && (
            <div className="relative z-10 shrink-0 border-t border-border/40 bg-background/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
              <div className="mx-auto max-w-2xl px-6 py-3 space-y-3">
                {errorBanner}
                {permissionAlert}
                <div className="flex items-center justify-between gap-3">
                  <div aria-live="polite">
                    {call.status === "ended" && (
                      <span className="font-system text-muted-foreground">Call ended</span>
                    )}
                  </div>
                  {call.supported && call.status !== "permission_denied" && (
                    <Button
                      type="button"
                      onClick={call.startCall}
                      className="h-10 rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
                    >
                      <Phone className="size-4" aria-hidden />
                      <span>{call.status === "ended" ? "Call again" : "Start call"}</span>
                    </Button>
                  )}
                </div>
                {composer}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
