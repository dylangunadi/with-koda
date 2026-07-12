"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechState = "unsupported" | "idle" | "listening" | "processing" | "denied" | "error";

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
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

/**
 * Push-to-talk speech recognition.
 * Final transcripts are delivered through onFinalTranscript and appended by
 * the caller; this hook never owns or clears composer text, so a recognition
 * failure can never lose anything the user typed.
 */
export function useSpeechRecognition(onFinalTranscript: (text: string) => void) {
  const [state, setState] = useState<SpeechState>("unsupported");
  const [interim, setInterim] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onFinalTranscript);
  callbackRef.current = onFinalTranscript;

  useEffect(() => {
    if (getSpeechRecognition()) setState("idle");
    return () => recognitionRef.current?.abort();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    setState((s) => (s === "listening" ? "processing" : s));
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return;
    setErrorMessage(null);
    setInterim("");
    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let interimText = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (interimText) {
        setState("listening");
        setInterim(interimText);
      }
      if (finalText) {
        setInterim("");
        callbackRef.current(finalText.trim());
      }
    };

    recognition.onerror = (event) => {
      setInterim("");
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setState("denied");
        setErrorMessage(
          "Microphone is blocked. Keep typing, or allow the mic in your browser settings."
        );
      } else {
        setState("error");
        setErrorMessage("Could not hear that. Your typed text is untouched, try again or keep typing.");
      }
    };

    recognition.onend = () => {
      setInterim("");
      setState((s) => (s === "denied" || s === "error" ? s : "idle"));
    };

    setState("listening");
    try {
      recognition.start();
    } catch {
      setState("error");
      setErrorMessage("Could not start the microphone. Keep typing instead.");
    }
  }, []);

  return { state, interim, errorMessage, start, stop };
}
