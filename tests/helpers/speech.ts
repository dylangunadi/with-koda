import type { Page } from "@playwright/test";

/**
 * Install scriptable fakes for window.SpeechRecognition and
 * window.speechSynthesis before page load. Real Web Speech does not run in
 * headless Chromium, so the fakes drive the app's real call state machine
 * (feature detection stays genuine: without the fakes there is no API and the
 * call controls must not render).
 *
 * Test controls (all on window):
 *   __speechInterim("part")                 — interim recognition result
 *   __speechFinal("text", confidence?)      — final result (default 0.9)
 *   __speechError("not-allowed" | ...)      — recognition error
 *   __speechEnd()                           — recognition session end
 *   __speechStartCount                      — recognition start() call count
 *   __spokenTexts                           — array of utterance texts spoken
 *   __speakingCount                         — utterances queued/being spoken
 *   __synthCancelled                        — speechSynthesis.cancel() called
 *   __finishSpeaking()                      — complete all pending utterances
 *   __holdSpeech (set true BEFORE a turn)   — utterances stay pending until
 *                                             __finishSpeaking()
 */
export async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & Window;

    // ------------------------- recognition fake -------------------------
    class FakeSpeechRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onstart: (() => void) | null = null;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        (w.__speechStartCount as number) = ((w.__speechStartCount as number) ?? 0) + 1;
        w.__activeSpeech = this;
        queueMicrotask(() => this.onstart?.());
      }
      stop() {
        queueMicrotask(() => this.onend?.());
      }
      abort() {
        queueMicrotask(() => this.onend?.());
      }
    }

    w.__speechStartCount = 0;
    w.SpeechRecognition = FakeSpeechRecognition;
    const active = () => w.__activeSpeech as FakeSpeechRecognition | undefined;
    const result = (transcript: string, isFinal: boolean, confidence: number) => ({
      resultIndex: 0,
      results: [Object.assign([{ transcript, confidence }], { isFinal })],
    });
    w.__speechInterim = (t: string) => active()?.onresult?.(result(t, false, 0));
    w.__speechFinal = (t: string, confidence = 0.9) =>
      active()?.onresult?.(result(t, true, confidence));
    w.__speechError = (error: string) => {
      active()?.onerror?.({ error });
      active()?.onend?.();
    };
    w.__speechEnd = () => active()?.onend?.();

    // ------------------------- synthesis fake ---------------------------
    const spoken: string[] = [];
    const pending: Array<{ u: FakeUtterance }> = [];
    w.__spokenTexts = spoken;
    w.__speakingCount = 0;
    w.__synthCancelled = false;
    w.__holdSpeech = false;

    class FakeUtterance {
      text: string;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const finish = (u: FakeUtterance, errored: boolean) => {
      (w.__speakingCount as number) = Math.max(0, (w.__speakingCount as number) - 1);
      if (errored) u.onerror?.();
      else u.onend?.();
    };

    w.SpeechSynthesisUtterance = FakeUtterance;
    w.__finishSpeaking = () => {
      while (pending.length) {
        const { u } = pending.shift()!;
        finish(u, false);
      }
    };
    const fakeSynth = {
      speak(u: FakeUtterance) {
        spoken.push(u.text);
        (w.__speakingCount as number) += 1;
        queueMicrotask(() => u.onstart?.());
        if (w.__holdSpeech) {
          pending.push({ u });
        } else {
          setTimeout(() => finish(u, false), 25);
        }
      },
      cancel() {
        w.__synthCancelled = true;
        while (pending.length) {
          const { u } = pending.shift()!;
          finish(u, true);
        }
      },
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [],
    } as unknown as SpeechSynthesis;
    Object.defineProperty(window, "speechSynthesis", { value: fakeSynth, configurable: true });
  });
}

/** Remove speech APIs entirely to simulate an unsupporting browser. */
export async function removeSpeech(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
    // speechSynthesis is a readonly getter in Chromium; shadow it instead.
    try {
      Object.defineProperty(window, "speechSynthesis", { value: undefined });
    } catch {
      /* best effort */
    }
  });
}
