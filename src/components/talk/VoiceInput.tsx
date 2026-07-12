"use client";

import { Mic, MicOff, Square } from "lucide-react";
import type { SpeechState } from "./useSpeechRecognition";

interface VoiceInputProps {
  state: SpeechState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

/**
 * Push-to-talk microphone button. Renders nothing when the browser has no
 * speech recognition support; text input is always the primary path.
 */
export function VoiceInput({ state, onStart, onStop, disabled }: VoiceInputProps) {
  if (state === "unsupported") return null;

  const listening = state === "listening";
  const denied = state === "denied";

  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      disabled={disabled || denied || state === "processing"}
      aria-label={
        denied ? "Microphone blocked" : listening ? "Stop listening" : "Speak your answer"
      }
      aria-pressed={listening}
      title={denied ? "Microphone is blocked in your browser settings." : undefined}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        listening
          ? "border-primary bg-accent text-primary"
          : denied
            ? "cursor-not-allowed border-border text-muted-foreground/50"
            : "border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
      }`}
    >
      {denied ? (
        <MicOff className="size-4" aria-hidden />
      ) : listening ? (
        <Square className="size-3.5 fill-current" aria-hidden />
      ) : (
        <Mic className="size-4" aria-hidden />
      )}
    </button>
  );
}
