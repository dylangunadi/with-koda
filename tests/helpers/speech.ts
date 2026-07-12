import type { Page } from "@playwright/test";

/**
 * Install a scriptable fake window.SpeechRecognition before page load.
 * Real Web Speech does not run in headless Chromium, so the fake drives the
 * app's real state machine (feature detection stays genuine: with no fake
 * installed there is no API and the mic button must not render).
 *
 * Control from the test:
 *   await page.evaluate(() => window.__speechEmit("hello world"))  // final result
 *   await page.evaluate(() => window.__speechError("not-allowed")) // error
 */
export async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    class FakeSpeechRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        (window as unknown as Record<string, unknown>).__activeSpeech = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }

    const w = window as unknown as Record<string, unknown>;
    w.SpeechRecognition = FakeSpeechRecognition;
    w.__speechEmit = (transcript: string) => {
      const active = w.__activeSpeech as FakeSpeechRecognition | undefined;
      active?.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript }], { isFinal: true })],
      });
      active?.onend?.();
    };
    w.__speechInterim = (transcript: string) => {
      const active = w.__activeSpeech as FakeSpeechRecognition | undefined;
      active?.onresult?.({
        resultIndex: 0,
        results: [Object.assign([{ transcript }], { isFinal: false })],
      });
    };
    w.__speechError = (error: string) => {
      const active = w.__activeSpeech as FakeSpeechRecognition | undefined;
      active?.onerror?.({ error });
      active?.onend?.();
    };
  });
}
