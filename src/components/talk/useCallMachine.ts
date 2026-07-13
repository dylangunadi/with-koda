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
  return "speechSynthesis" in window && window.speechSynthesis ? window.speechSynthesis : null;
}

export interface CallMachineCallbacks {
  /** A complete user turn was detected. lowConfidence means the transcript
   * should be corrected in the composer rather than submitted directly. */
  onTurnReady: (text: string, opts: { lowConfidence: boolean }) => void;
  /** The user interrupted Koda mid-reply; speech output is already cut. */
  onBargeIn?: () => void;
}

export interface CallMachineOptions {
  /** Use the server TTS proxy (natural cloud voice) for Koda's speech,
   * falling back to browser voices if it fails. */
  cloudTts?: boolean;
}

const noopSubscribe = () => () => {};

/**
 * Conversational call state machine.
 * Owns speech recognition (continuous, with pause-based turn detection) and
 * speech output (sentence-queued cloud TTS or browser voices). The caller
 * owns the network turn: call beginProcessing() when a turn is submitted,
 * feed reply text through speakDelta(), then finishTurn().
 *
 * Invariants:
 * - Raw audio is never stored; only transcripts leave this hook.
 * - The mic is captured only between startCall() and endCall()/mute, and
 *   micActive reflects capture truthfully for the always-on indicator.
 * - HALF-DUPLEX: the mic is closed whenever Koda's voice is audible, so the
 *   speaker output can never loop back in as user speech. Interrupting is a
 *   deliberate action (interrupt(), wired to a tap), not voice detection.
 */
export function useCallMachine(callbacks: CallMachineCallbacks, options?: CallMachineOptions) {
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
  const cloudTtsRef = useRef(options?.cloudTts ?? false);
  useEffect(() => {
    cloudTtsRef.current = options?.cloudTts ?? false;
  }, [options?.cloudTts]);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  const callActiveRef = useRef(false);
  const mutedRef = useRef(false);
  const micActiveRef = useRef(false);
  const pendingRef = useRef<{ text: string; confidences: number[] }>({ text: "", confidences: [] });
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utteranceCountRef = useRef(0);
  const replyDoneRef = useRef(true);
  const sentenceBufferRef = useRef("");
  const networkRetriedRef = useRef(false);
  // After an interrupt or failure, late-arriving deltas must stay silent.
  const suppressSpeechRef = useRef(false);
  // End-of-call wind-down: mic off, queued speech drains, then ended.
  const windingDownRef = useRef(false);
  // Cloud speech pipeline: sentences fetch as they form and play in order.
  // The generation counter invalidates everything queued before a cancel.
  const speechGenRef = useRef(0);
  const speechQueueRef = useRef<Array<{ text: string; blob: Promise<Blob | null>; gen: number }>>([]);
  const playingRef = useRef(false);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  // Once the TTS proxy fails, stay on browser voices for the session.
  const cloudFailedRef = useRef(false);

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
    speechGenRef.current += 1;
    speechQueueRef.current = [];
    sentenceBufferRef.current = "";
    utteranceCountRef.current = 0;
    playingRef.current = false;
    if (audioElRef.current) {
      audioElRef.current.onended = null;
      audioElRef.current.onerror = null;
      audioElRef.current.pause();
      audioElRef.current = null;
    }
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
      if (recognitionRef.current !== recognition) return;
      micActiveRef.current = true;
      setMicActive(true);
      if (statusRef.current === "connecting") setStatusBoth("listening");
    };

    recognition.onresult = (event) => {
      // A result already queued when the call ended (or the surface
      // unmounted) must not repopulate the turn buffer or arm timers.
      if (!callActiveRef.current || recognitionRef.current !== recognition) return;
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

      // Turn detection: quiet for the threshold after some final speech.
      clearPauseTimer();
      if (pendingRef.current.text) {
        pauseTimerRef.current = setTimeout(() => {
          if (statusRef.current === "listening") submitPendingTurn();
        }, PAUSE_THRESHOLD_MS);
      }
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        micActiveRef.current = false;
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
      // A replaced instance (reconnect started a fresh one) must not touch
      // shared state or restart itself alongside the new instance.
      if (recognitionRef.current !== recognition) return;
      micActiveRef.current = false;
      setMicActive(false);
      const current = statusRef.current;
      if (!callActiveRef.current || mutedRef.current || current === "permission_denied" || current === "ended") {
        return;
      }
      // Half-duplex: while Koda is audible the mic stays closed on purpose;
      // enterListening reopens it once the reply has fully drained.
      if (current === "speaking") return;
      // Browsers stop continuous recognition after silence; keep the call live.
      // A single automatic retry covers transient network errors too.
      const delay = current === "network_error" ? 1000 : 150;
      if (current === "network_error" && networkRetriedRef.current) return;
      if (current === "network_error") networkRetriedRef.current = true;
      restartTimerRef.current = setTimeout(() => {
        if (!callActiveRef.current || mutedRef.current) return;
        if (recognitionRef.current !== recognition) return;
        if (statusRef.current === "speaking") return;
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

  const enterListening = useCallback(() => {
    setStatusBoth("listening");
    // Half-duplex: the mic was closed while Koda spoke; reopen it now.
    if (callActiveRef.current && !mutedRef.current && !micActiveRef.current) {
      startRecognition();
    }
    // Speech that accumulated while Koda was thinking still forms a turn. No
    // new recognition result may ever arrive to arm the pause timer, so arm
    // it here or the words would sit unsubmitted forever. Muted means muted:
    // pre-mute speech must not auto-submit.
    if (pendingRef.current.text && !mutedRef.current) {
      clearPauseTimer();
      pauseTimerRef.current = setTimeout(() => {
        if (statusRef.current === "listening") submitPendingTurn();
      }, PAUSE_THRESHOLD_MS);
    }
  }, [clearPauseTimer, setStatusBoth, startRecognition, submitPendingTurn]);

  // The moment Koda becomes audible the mic must already be closed: with the
  // mic open, the speaker output is transcribed as user speech (echo).
  const enterSpeaking = useCallback(() => {
    if (!callActiveRef.current) return;
    if (statusRef.current !== "speaking") setStatusBoth("speaking");
    setInterim("");
    if (micActiveRef.current) recognitionRef.current?.stop();
  }, [setStatusBoth]);

  const startCall = useCallback(() => {
    if (!supported || callActiveRef.current) return;
    networkRetriedRef.current = false;
    suppressSpeechRef.current = false;
    windingDownRef.current = false;
    cloudFailedRef.current = false;
    callActiveRef.current = true;
    setCallActive(true);
    mutedRef.current = false;
    setMuted(false);
    setStatusBoth("connecting");
    startRecognition();
  }, [supported, setStatusBoth, startRecognition]);

  const endCall = useCallback(() => {
    callActiveRef.current = false;
    windingDownRef.current = false;
    setCallActive(false);
    clearPauseTimer();
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort();
    cancelSpeech();
    pendingRef.current = { text: "", confidences: [] };
    setInterim("");
    setMicActive(false);
    micActiveRef.current = false;
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
    } else if (statusRef.current !== "speaking") {
      // Unmuting while Koda is audible must not reopen the mic (echo);
      // enterListening will once the reply drains.
      startRecognition();
    }
  }, [clearPauseTimer, startRecognition]);

  /** The component submitted a turn; replies may start streaming. */
  const beginProcessing = useCallback(() => {
    clearPauseTimer();
    suppressSpeechRef.current = false;
    replyDoneRef.current = false;
    sentenceBufferRef.current = "";
    if (callActiveRef.current) setStatusBoth("processing");
  }, [clearPauseTimer, setStatusBoth]);

  // After the reply is fully spoken the call returns to listening (the muted
  // flag overrides what the UI shows and whether the mic actually captures),
  // or ends if a wind-down was requested while speech was still draining.
  const maybeFinishSpeaking = useCallback(() => {
    if (utteranceCountRef.current !== 0 || !replyDoneRef.current || !callActiveRef.current) return;
    if (windingDownRef.current) {
      endCall();
      return;
    }
    // Cancelled utterances settle asynchronously; only a turn that is still
    // in flight may transition to listening (an error state must persist).
    const current = statusRef.current;
    if (current === "speaking" || current === "processing") enterListening();
  }, [endCall, enterListening]);

  const speakWithBrowserVoice = useCallback(
    (text: string, gen: number) => {
      const synth = getSpeechSynthesis();
      if (!synth) {
        // No voice available at all: settle immediately so the turn finishes.
        if (gen === speechGenRef.current) {
          utteranceCountRef.current = Math.max(0, utteranceCountRef.current - 1);
          maybeFinishSpeaking();
        }
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onstart = () => {
        if (gen === speechGenRef.current) enterSpeaking();
      };
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (gen !== speechGenRef.current) return;
        utteranceCountRef.current = Math.max(0, utteranceCountRef.current - 1);
        maybeFinishSpeaking();
      };
      utterance.onend = settle;
      utterance.onerror = settle;
      synth.speak(utterance);
    },
    [enterSpeaking, maybeFinishSpeaking]
  );

  const fetchTtsAudio = useCallback(async (text: string): Promise<Blob | null> => {
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  }, []);

  const playNextAudio = useCallback(() => {
    const pump = () => {
      if (playingRef.current) return;
      const item = speechQueueRef.current.shift();
      if (!item) return;
      playingRef.current = true;
      void item.blob.then((blob) => {
        if (item.gen !== speechGenRef.current) {
          playingRef.current = false;
          pump();
          return;
        }
        if (!blob) {
          // The proxy failed: speak this sentence (and the rest of the
          // session) through browser voices so the reply is never dropped.
          cloudFailedRef.current = true;
          playingRef.current = false;
          speakWithBrowserVoice(item.text, item.gen);
          pump();
          return;
        }
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElRef.current = audio;
        enterSpeaking();
        let settled = false;
        const settle = () => {
          if (settled) return;
          settled = true;
          URL.revokeObjectURL(url);
          if (audioElRef.current === audio) audioElRef.current = null;
          playingRef.current = false;
          if (item.gen === speechGenRef.current) {
            utteranceCountRef.current = Math.max(0, utteranceCountRef.current - 1);
            maybeFinishSpeaking();
          }
          pump();
        };
        audio.onended = settle;
        audio.onerror = settle;
        audio.play().catch(settle);
      });
    };
    pump();
  }, [enterSpeaking, maybeFinishSpeaking, speakWithBrowserVoice]);

  const speakSentence = useCallback(
    (sentence: string) => {
      const text = sentence.trim();
      if (!text || !callActiveRef.current || suppressSpeechRef.current) return;
      const useCloud =
        cloudTtsRef.current && !cloudFailedRef.current && typeof Audio !== "undefined";
      if (!useCloud && !getSpeechSynthesis()) return; // no voice available; text still renders
      utteranceCountRef.current += 1;
      const gen = speechGenRef.current;
      if (useCloud) {
        // The fetch starts immediately so later sentences download while the
        // current one plays; playback stays strictly in order.
        speechQueueRef.current.push({ text, blob: fetchTtsAudio(text), gen });
        playNextAudio();
      } else {
        speakWithBrowserVoice(text, gen);
      }
    },
    [fetchTtsAudio, playNextAudio, speakWithBrowserVoice]
  );

  /** Feed streamed reply text; complete sentences are spoken as they form. */
  const speakDelta = useCallback(
    (text: string) => {
      if (!callActiveRef.current || suppressSpeechRef.current) return;
      sentenceBufferRef.current += text;
      const parts = sentenceBufferRef.current.split(/(?<=[.!?])\s+/);
      while (parts.length > 1) {
        speakSentence(parts.shift() as string);
      }
      sentenceBufferRef.current = parts[0] ?? "";
    },
    [speakSentence]
  );

  /** No more reply text is coming; drain remaining speech, then listen. */
  const finishTurn = useCallback(() => {
    replyDoneRef.current = true;
    if (sentenceBufferRef.current.trim()) {
      speakSentence(sentenceBufferRef.current);
      sentenceBufferRef.current = "";
    }
    maybeFinishSpeaking();
  }, [speakSentence, maybeFinishSpeaking]);

  /** The turn failed after submission; stop any speech and surface the state.
   * Suppression stays on until the next turn so a reply that keeps streaming
   * past the failure point never becomes audible. */
  const failTurn = useCallback(
    (kind: "ai_error" | "network_error") => {
      suppressSpeechRef.current = true;
      cancelSpeech();
      replyDoneRef.current = true;
      if (callActiveRef.current) setStatusBoth(kind);
    },
    [cancelSpeech, setStatusBoth]
  );

  /** Deliberate interruption (tap) while Koda is speaking: cut the audio,
   * silence the rest of the streaming reply, and hand the floor back. */
  const interrupt = useCallback(() => {
    if (!callActiveRef.current || statusRef.current !== "speaking") return;
    suppressSpeechRef.current = true;
    cancelSpeech();
    replyDoneRef.current = true;
    callbacksRef.current.onBargeIn?.();
    enterListening();
  }, [cancelSpeech, enterListening]);

  /** Recover from an error state without restarting the call. */
  const resumeListening = useCallback(() => {
    if (callActiveRef.current && !mutedRef.current) enterListening();
  }, [enterListening]);

  /** Manual recovery from a dead recognition session (network errors exhaust
   * the single automatic retry): start a fresh recognizer. */
  const reconnect = useCallback(() => {
    if (!callActiveRef.current || mutedRef.current) return;
    networkRetriedRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    recognitionRef.current?.abort();
    setStatusBoth("connecting");
    startRecognition();
  }, [setStatusBoth, startRecognition]);

  /** End the call gently: the mic stops capturing now, any queued reply
   * speech finishes, and only then does the call end. */
  const windDown = useCallback(() => {
    if (!callActiveRef.current) return;
    windingDownRef.current = true;
    mutedRef.current = true; // blocks the onend auto-restart
    recognitionRef.current?.stop();
    clearPauseTimer();
    pendingRef.current = { text: "", confidences: [] };
    setInterim("");
    setMicActive(false);
    maybeFinishSpeaking();
  }, [clearPauseTimer, maybeFinishSpeaking]);

  useEffect(() => {
    return () => {
      // Kill the call flags FIRST: abort() fires an async onend whose restart
      // path would otherwise reopen the microphone after unmount. The status
      // ref moves off "listening" too, so an already-queued result event can
      // never submit a phantom turn afterwards.
      callActiveRef.current = false;
      mutedRef.current = true;
      statusRef.current = "ended";
      speechGenRef.current += 1;
      speechQueueRef.current = [];
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.abort();
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      getSpeechSynthesis()?.cancel();
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
    windDown,
    toggleMute,
    beginProcessing,
    speakDelta,
    finishTurn,
    failTurn,
    interrupt,
    resumeListening,
    reconnect,
  };
}
