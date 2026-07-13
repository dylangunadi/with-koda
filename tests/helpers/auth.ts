import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { TEST_PASSWORD } from "./db";

/** Sign in through the real login UI. */
export async function loginViaUi(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(inbox|talk)/, { timeout: 15000 });
}

/** Create an account through the real signup UI (lands on /talk for new users). */
export async function signupViaUi(page: Page, email: string, password = TEST_PASSWORD) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/talk/, { timeout: 15000 });
}
