"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReviewConfirm } from "@/components/talk/ReviewConfirm";
import { VoiceInput } from "@/components/talk/VoiceInput";
import { useSpeechRecognition } from "@/components/talk/useSpeechRecognition";
import type { OnboardingExtracted } from "@/lib/types";

interface ChatMessage {
  role: "user" | "koda";
  content: string;
}

interface TalkToKodaProps {
  initialMessages: ChatMessage[];
  initialExtracted: OnboardingExtracted;
  initialMissing: string[];
  firstQuestion: string;
  totalFields: number;
  initialAiMode: "live" | "mock";
}

const GREETING =
  "Hi, I am Koda. I help you figure out what to pursue, who to talk to, and what to send. A few quick questions so I can be useful, then you get your first brief.";

export function TalkToKoda({
  initialMessages,
  initialExtracted,
  initialMissing,
  firstQuestion,
  totalFields,
  initialAiMode,
}: TalkToKodaProps) {
  const router = useRouter();
  const resumed = initialMessages.length > 0;
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (!resumed) {
      return [{ role: "koda", content: `${GREETING} ${firstQuestion}` }];
    }
    // On resume, restate the open question if the transcript ends with the
    // user's own message, so they are never left wondering what comes next.
    const needsPrompt =
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
  const [done, setDone] = useState(initialMissing.length === 0);
  const [aiMode, setAiMode] = useState<string>(initialAiMode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceUsedRef = useRef(false);

  // Voice transcripts append to the composer; they never replace typed text,
  // and the user can edit before sending.
  const speech = useSpeechRecognition((transcript) => {
    voiceUsedRef.current = true;
    setInput((prev) => (prev.trim() ? `${prev.trimEnd()} ${transcript}` : transcript));
    inputRef.current?.focus();
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, done]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setSending(true);
    setError(null);
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/talk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          inputMode: voiceUsedRef.current ? "voice" : "text",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Keep the user's text in the composer; drop the optimistic bubble.
        setMessages((prev) => prev.slice(0, -1));
        setError(data.error ?? "Koda could not process that. Try again.");
        return;
      }
      setInput("");
      voiceUsedRef.current = false;
      setMessages((prev) => [...prev, { role: "koda", content: data.reply }]);
      setExtracted(data.extracted ?? {});
      setMissing(data.missing ?? []);
      if (data.aiMode) setAiMode(data.aiMode);
      if (data.done) setDone(true);
    } catch {
      setMessages((prev) => prev.slice(0, -1));
      setError("Network problem. Your message is still here, try again.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const answered = totalFields - missing.length;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      <div className="grain fixed inset-0 pointer-events-none" />

      <header className="relative z-10 border-b border-border/40 bg-background/90 backdrop-blur-md">
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
            <span className="font-system text-primary">
              {done ? "Review" : `${answered} of ${totalFields} covered`}
            </span>
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
        <div
          className="mx-auto max-w-2xl px-6 py-8 space-y-6 page-enter"
          aria-live="polite"
        >
          {resumed && (
            <p className="font-system text-muted-foreground text-center">
              Resumed. Nothing you said was lost.
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "koda" ? (
              <div key={i} className="max-w-[85%]">
                <p className="font-system text-primary mb-1.5">Koda</p>
                <p className="text-[15px] leading-relaxed text-foreground whitespace-pre-wrap">{m.content}</p>
              </div>
            ) : (
              <div key={i} className="max-w-[85%] ml-auto">
                <div className="rounded-xl bg-accent px-4 py-3 text-[15px] leading-relaxed text-accent-foreground whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            )
          )}
          {sending && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="status-dot" />
              <span className="font-system">Koda is thinking</span>
            </div>
          )}
          {done && (
            <ReviewConfirm extracted={extracted} onDone={() => router.push("/inbox")} />
          )}
        </div>
      </div>

      {!done && (
        <div className="relative z-10 border-t border-border/40 bg-background/95 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-6 py-4">
            {error && (
              <div
                role="alert"
                className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={send}
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
                send();
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
                    send();
                  }
                }}
                placeholder="Type your answer"
                aria-label="Message Koda"
                rows={2}
                className="min-h-[56px] max-h-40 resize-none rounded-lg text-[15px]"
                autoFocus
              />
              <VoiceInput
                state={speech.state}
                onStart={speech.start}
                onStop={speech.stop}
                disabled={sending}
              />
              <Button
                type="submit"
                disabled={sending || !input.trim()}
                className="h-11 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
              >
                {sending ? "Sending" : "Send"}
              </Button>
            </form>
            <div className="mt-2 min-h-4" aria-live="polite">
              {speech.state === "listening" ? (
                <span className="inline-flex items-center gap-1.5 font-system text-primary">
                  <span className="status-dot" aria-hidden />
                  Listening{speech.interim ? `: ${speech.interim}` : ""}
                </span>
              ) : speech.errorMessage ? (
                <span className="font-system text-destructive">{speech.errorMessage}</span>
              ) : (
                <span className="font-system text-muted-foreground">
                  Enter to send. Shift plus Enter for a new line.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
