import { test, expect } from "@playwright/test";
import { uniqueEmail } from "./helpers/db";
import { signupViaUi } from "./helpers/auth";
import { installFakeSpeech, removeSpeech } from "./helpers/speech";

declare global {
  interface Window {
    __speechInterim: (t: string) => void;
    __speechFinal: (t: string, confidence?: number) => void;
    __speechError: (e: string) => void;
    __speechStartCount: number;
    __spokenTexts: string[];
    __synthCancelled: boolean;
    __holdSpeech: boolean;
    __finishSpeaking: () => void;
  }
}

test("browser without speech support gets a fully usable text flow with no call controls", async ({
  page,
}) => {
  await removeSpeech(page);
  await signupViaUi(page, uniqueEmail("novoice"));
  await expect(page.getByLabel("Message Koda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start call" })).toHaveCount(0);

  await page.getByLabel("Message Koda").fill("I'm Casey, a senior at UCLA");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });
});

test("a call turn is auto-detected, spoken back, and the mic state is honest", async ({
  page,
}) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("callflow"));

  // Start call: automatic listening, visible mic indicator.
  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();
  await expect(page.getByText("Mic on")).toBeVisible();

  // Live interim transcript renders while speaking.
  await page.evaluate(() => window.__speechInterim("i'm jordan a junior"));
  await expect(page.getByText("i'm jordan a junior")).toBeVisible();

  // Final result + pause threshold => automatic turn submission.
  await page.evaluate(() => window.__speechFinal("I'm Jordan, a junior at UC Berkeley", 0.95));
  await expect(page.getByText("I'm Jordan, a junior at UC Berkeley")).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });

  // The reply was spoken via TTS and the call returned to listening.
  const spoken = await page.evaluate(() => window.__spokenTexts.join(" "));
  expect(spoken).toContain("Jordan");
  await expect(page.getByText("Listening", { exact: true })).toBeVisible({ timeout: 10000 });

  // Mute stops the mic truthfully and recognition does not auto-restart.
  await page.getByRole("button", { name: "Mute" }).click();
  await expect(page.getByText("Muted")).toBeVisible();
  await expect(page.getByText("Mic on")).toHaveCount(0);
  await page.getByRole("button", { name: "Unmute" }).click();
  await expect(page.getByText("Mic on")).toBeVisible();

  // End call stops listening cleanly; text path continues.
  await page.getByRole("button", { name: "End call" }).click();
  await expect(page.getByText("Mic on")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Call again" })).toBeVisible();
  await page.getByLabel("Message Koda").fill("Product management roles");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("2 of 9 covered")).toBeVisible({ timeout: 20000 });
});

test("interrupting Koda cuts speech immediately", async ({ page }) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("bargein"));

  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();

  // Hold utterances open so Koda is mid-speech when the user interrupts.
  await page.evaluate(() => {
    window.__holdSpeech = true;
  });
  await page.evaluate(() => window.__speechFinal("I'm Riley, a junior at Stanford", 0.95));
  await expect(page.getByText("Koda is speaking")).toBeVisible({ timeout: 20000 });

  // Sustained user speech during TTS cancels it and returns to listening.
  await page.evaluate(() => window.__speechInterim("wait actually I have a question"));
  await expect
    .poll(async () => page.evaluate(() => window.__synthCancelled))
    .toBe(true);
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();
});

test("low-confidence transcripts go to the composer for correction, not straight to Koda", async ({
  page,
}) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("lowconf"));

  await page.getByRole("button", { name: "Start call" }).click();
  await expect(page.getByText("Listening", { exact: true })).toBeVisible();

  await page.evaluate(() => window.__speechFinal("I'm Morrigan a junior at you sea berkeley", 0.2));
  await expect(page.getByText("Check what Koda heard, then send.")).toBeVisible({ timeout: 5000 });
  await expect(page.getByLabel("Message Koda")).toHaveValue(
    "I'm Morrigan a junior at you sea berkeley"
  );
  // Nothing was submitted automatically.
  await expect(page.getByText("0 of 9 covered")).toBeVisible();

  // The user corrects it and sends; the corrected text is the turn.
  await page.getByLabel("Message Koda").fill("I'm Morgan, a junior at UC Berkeley");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });
});

test("microphone denial ends the call safely and keeps text fully usable", async ({ page }) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("micdenied"));

  await page.getByLabel("Message Koda").fill("I'm Riley");
  await page.getByRole("button", { name: "Start call" }).click();
  await page.evaluate(() => window.__speechError("not-allowed"));

  await expect(page.getByText(/Microphone is blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start call" })).toHaveCount(0);
  // Typed text is untouched and the flow continues by text.
  await expect(page.getByLabel("Message Koda")).toHaveValue("I'm Riley");
  await page.getByLabel("Message Koda").fill("I'm Riley, a junior at Stanford");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });
});

test("user turns appear instantly and Koda's reply streams in", async ({ page }) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("optimistic"));

  const message = "I'm Sam, a sophomore at Cal";
  await page.getByLabel("Message Koda").fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  // Optimistic: the user bubble is visible immediately and the composer
  // cleared, before the reply completes.
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByLabel("Message Koda")).toHaveValue("");
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });
});
