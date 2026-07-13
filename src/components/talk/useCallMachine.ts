"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type CallStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "processing"
  | "speaking"
  | "ended"
  | "permission_denied"
  | "recognition_error"
  | "network_error"
  | "ai_error";

/** Silence after the last final result before a turn is considered complete. */
const PAUSE_THRESHOLD_MS = 1400;
/** Interim speech length that counts as an interruption while Koda speaks. */
const BARGE_IN_MIN_CHARS = 12;
/** Below this average confidence the transcript goes to the composer for
 * correction instead of being submitted automatically. */
const LOW_CONFIDENCE = 0.5;

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence?: number } }>;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return "speechSynthesis" in window ? window.speechSynthesis : null;
}

export interface CallMachineCallbacks {
  /** A complete user turn was detected. lowConfidence means the transcript
   * should be corrected in the composer rather than submitted directly. */
  onTurnReady: (text: string, opts: { lowConfidence: boolean }) => void;
  /** The user started speaking while Koda was speaking; TTS is already cut. */
  onBargeIn?: () => void;
}

const noopSubscribe = () => () => {};

/**
 * Conversational call state machine.
 * Owns speech recognition (continuous, with pause-based turn detection) and
 * speech synthesis (sentence-queued, interruptible). The caller owns the
 * network turn: call beginProcessing() when a turn is submitted, feed reply
 * text through speakDelta(), then finishTurn().
 *
 * Invariants:
 * - Raw audio is never stored; only transcripts leave this hook.
 * - The mic is captured only between startCall() and endCall()/mute, and
 *   micActive reflects capture truthfully for the always-on indicator.
 * - Recognition keeps running while Koda speaks solely to allow interruption;
 *   sustained speech cancels TTS immediately (never both audible at once).
 */
export function useCallMachine(callbacks: CallMachineCallbacks) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getSpeechRecognition() !== null,
    () => false
  );
  const ttsSupported = useSyncExternalStore(
    noopSubscribe,
    () => getSpeechSynthesis() !== null,
    () => false
  );

  const [status, setStatus] = useState<CallStatus>("idle");
  const [callActive, setCallActive] = useState(false);
  const [muted, setMuted] = useState(false);
  const [interim, setInterim] = useState("");
  const [micActive, setMicActive] = useState(false);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const callActiveRef = useRef(false);
  const mutedRef = useRef(false);
  const pendingRef = useRef<{ text: string; confidences: number[] }>({ text: "", confidences: [] });
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceCountRef = useRef(0);
  const replyDoneRef = useRef(true);
  const sentenceBufferRef = useRef("");
  const networkRetriedRef = useRef(false);

  const setStatusBoth = useCallback((next: CallStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const submitPendingTurn = useCallback(() => {
    clearPauseTimer();
    const { text, confidences } = pendingRef.current;
    const turn = text.trim();
    pendingRef.current = { text: "", confidences: [] };
    setInterim("");
    if (!turn) return;
    const known = confidences.filter((c) => Number.isFinite(c));
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
    callbacksRef.current.onTurnReady(turn, { lowConfidence: avg < LOW_CONFIDENCE });
  }, [clearPauseTimer]);

  const cancelSpeech = useCallback(() => {
    sentenceBufferRef.current = "";
    utteranceCountRef.current = 0;
    getSpeechSynthesis()?.cancel();
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {
      setMicActive(true);
      if (statusRef.current === "connecting") setStatusBoth("listening");
    };

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          pendingRef.current.text += (pendingRef.current.text ? " " : "") + transcript.trim();
          pendingRef.current.confidences.push(result[0].confidence ?? NaN);
        } else {
          interimText += transcript;
        }
      }
      setInterim(interimText);

      // Interrupting Koda: sustained speech cuts TTS instantly.
      if (statusRef.current === "speaking") {
        const spoken = (pendingRef.current.text + interimText).trim();
        if (spoken.length >= BARGE_IN_MIN_CHARS) {
          cancelSpeech();
          replyDoneRef.current = true;
          setStatusBoth("listening");
          callbacksRef.current.onBargeIn?.();
        }
      }

      // Turn detection: quiet for the threshold after some final speech.
      clearPauseTimer();
      if (pendingRef.current.text) {
        pauseTimerRef.current = setTimeout(() => {
          if (statusRef.current === "listening") submitPendingTurn();
        }, PAUSE_THRESHOLD_MS);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicActive(false);
        setCallActive(false);
        callActiveRef.current = false;
        cancelSpeech();
        setStatusBoth("permission_denied");
        fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "voice_permission_denied" }),
        }).catch(() => {});
      } else if (event.error === "network") {
        setStatusBoth("network_error");
      } else if (event.error === "no-speech" || event.error === "aborted") {
        // Benign; onend handles restart.
      } else {
        setStatusBoth("recognition_error");
      }
    };

    recognition.onend = () => {
      setMicActive(false);
      const current = statusRef.current;
      if (!callActiveRef.current || mutedRef.current || current === "permission_denied" || current === "ended") {
        return;
      }
      // Browsers stop continuous recognition after silence; keep the call live.
      // A single automatic retry covers transient network errors too.
      const delay = current === "network_error" ? 1000 : 150;
      if (current === "network_error" && networkRetriedRef.current) return;
      if (current === "network_error") networkRetriedRef.current = true;
      restartTimerRef.current = setTimeout(() => {
        if (!callActiveRef.current || mutedRef.current) return;
        try {
          recognition.start();
          if (statusRef.current === "network_error" || statusRef.current === "recognition_error") {
            setStatusBoth("listening");
            networkRetriedRef.current = false;
          }
        } catch {
          /* already started */
        }
      }, delay);
    };

    try {
      recognition.start();
    } catch {
      setStatusBoth("recognition_error");
    }
  }, [cancelSpeech, clearPauseTimer, setStatusBoth, submitPendingTurn]);

  const startCall = useCallback(() => {
    if (!supported || callActiveRef.current) return;
    networkRetriedRef.current = false;
    callActiveRef.current = true;
    setCallActive(true);
    mutedRef.current = false;
    setMuted(false);
    setStatusBoth("connecting");
    startRecognition();
  }, [supported, setStatusBoth, startRecognition]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    setCallActive(false);
    clearPauseTimer();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort();
    cancelSpeech();
    pendingRef.current = { text: "", confidences: [] };
    setInterim("");
    setMicActive(false);
    replyDoneRef.current = true;
    setStatusBoth("ended");
  }, [cancelSpeech, clearPauseTimer, setStatusBoth]);

  const toggleMute = useCallback(() => {
    if (!callActiveRef.current) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (next) {
      recognitionRef.current?.stop();
      clearPauseTimer();
    } else {
      startRecognition();
    }
  }, [clearPauseTimer, startRecognition]);

  /** The component submitted a turn; replies may start streaming. */
  const beginProcessing = useCallback(() => {
    clearPauseTimer();
    replyDoneRef.current = false;
    sentenceBufferRef.current = "";
    if (callActiveRef.current) setStatusBoth("processing");
  }, [clearPauseTimer, setStatusBoth]);

  // After the reply is fully spoken the call returns to listening (the muted
  // flag overrides what the UI shows and whether the mic actually captures).
  const maybeFinishSpeaking = useCallback(() => {
    if (utteranceCountRef.current === 0 && replyDoneRef.current && callActiveRef.current) {
      setStatusBoth("listening");
    }
  }, [setStatusBoth]);

  const speakSentence = useCallback(
    (sentence: string) => {
      const synth = getSpeechSynthesis();
      const text = sentence.trim();
      if (!synth || !text || !callActiveRef.current) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utteranceCountRef.current += 1;
      utterance.onstart = () => {
        if (callActiveRef.current && statusRef.current !== "listening") {
          setStatusBoth("speaking");
        }
      };
      const settle = () => {
        utteranceCountRef.current = Math.max(0, utteranceCountRef.current - 1);
        maybeFinishSpeaking();
      };
      utterance.onend = settle;
      utterance.onerror = settle;
      synth.speak(utterance);
    },
    [maybeFinishSpeaking, setStatusBoth]
  );

  /** Feed streamed reply text; complete sentences are spoken as they form. */
  const speakDelta = useCallback(
    (text: string) => {
      if (!ttsSupported || !callActiveRef.current) return;
      sentenceBufferRef.current += text;
      const parts = sentenceBufferRef.current.split(/(?<=[.!?])\s+/);
      while (parts.length > 1) {
        speakSentence(parts.shift() as string);
      }
      sentenceBufferRef.current = parts[0] ?? "";
    },
    [speakSentence, ttsSupported]
  );

  /** No more reply text is coming; drain remaining speech, then listen. */
  const finishTurn = useCallback(() => {
    replyDoneRef.current = true;
    if (sentenceBufferRef.current.trim()) {
      speakSentence(sentenceBufferRef.current);
      sentenceBufferRef.current = "";
    }
    if (utteranceCountRef.current === 0 && callActiveRef.current) {
      setStatusBoth("listening");
    }
  }, [speakSentence, setStatusBoth]);

  /** The turn failed after submission; stop any speech and surface the state. */
  const failTurn = useCallback(
    (kind: "ai_error" | "network_error") => {
      cancelSpeech();
      replyDoneRef.current = true;
      if (callActiveRef.current) setStatusBoth(kind);
    },
    [cancelSpeech, setStatusBoth]
  );

  /** Recover from an error state without restarting the call. */
  const resumeListening = useCallback(() => {
    if (callActiveRef.current && !mutedRef.current) setStatusBoth("listening");
  }, [setStatusBoth]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      getSpeechSynthesis()?.cancel();
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, []);

  return {
    supported,
    ttsSupported,
    status,
    callActive,
    muted,
    interim,
    micActive,
    startCall,
    endCall,
    toggleMute,
    beginProcessing,
    speakDelta,
    finishTurn,
    failTurn,
    resumeListening,
  };
}
