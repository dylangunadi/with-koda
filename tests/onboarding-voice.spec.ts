import { test, expect } from "@playwright/test";
import { uniqueEmail } from "./helpers/db";
import { signupViaUi } from "./helpers/auth";
import { installFakeSpeech } from "./helpers/speech";

test("browser without speech support gets a fully usable text flow with no mic button", async ({
  page,
}) => {
  // Chromium ships webkitSpeechRecognition; remove both globals to simulate a
  // browser with no speech support so real feature detection hides the mic.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.SpeechRecognition;
    delete w.webkitSpeechRecognition;
  });
  await signupViaUi(page, uniqueEmail("novoice"));
  await expect(page.getByLabel("Message Koda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Speak your answer" })).toHaveCount(0);

  // Text path works.
  await page.getByLabel("Message Koda").fill("I'm Casey, a senior at UCLA");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 15000 });
});

test("microphone denial keeps typed text and the text flow fully usable", async ({ page }) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("micdenied"));

  // Type first, then attempt voice.
  await page.getByLabel("Message Koda").fill("I'm Riley");
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await expect(page.getByText(/Listening/)).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __speechError: (e: string) => void }).__speechError("not-allowed")
  );

  // Denial message, disabled mic, typed text untouched.
  await expect(page.getByText(/Microphone is blocked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Microphone blocked" })).toBeDisabled();
  await expect(page.getByLabel("Message Koda")).toHaveValue("I'm Riley");

  // Onboarding continues by text.
  await page.getByLabel("Message Koda").fill("I'm Riley, a junior at Stanford");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 15000 });
});

test("voice transcript appends to typed text, is editable, and sends as voice input", async ({
  page,
}) => {
  await installFakeSpeech(page);
  await signupViaUi(page, uniqueEmail("voice"));

  await page.getByLabel("Message Koda").fill("I'm Morgan,");
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await expect(page.getByText(/Listening/)).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __speechInterim: (t: string) => void }).__speechInterim("a sophom")
  );
  await expect(page.getByText(/Listening: a sophom/)).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __speechEmit: (t: string) => void }).__speechEmit(
      "a sophomore at MIT"
    )
  );

  // Appended, not replaced; still editable before sending.
  await expect(page.getByLabel("Message Koda")).toHaveValue("I'm Morgan, a sophomore at MIT");

  const talkResponse = page.waitForResponse(
    (res) => res.url().includes("/api/talk") && res.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Send" }).click();
  const response = await talkResponse;
  expect(response.request().postDataJSON().inputMode).toBe("voice");
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 15000 });

  // A speech error after a successful voice turn must not lose new typed text.
  await page.getByLabel("Message Koda").fill("Product roles");
  await page.getByRole("button", { name: "Speak your answer" }).click();
  await page.evaluate(() =>
    (window as unknown as { __speechError: (e: string) => void }).__speechError("network")
  );
  await expect(page.getByText(/Could not hear that/)).toBeVisible();
  await expect(page.getByLabel("Message Koda")).toHaveValue("Product roles");
});
