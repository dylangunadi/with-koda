import { test, expect } from "@playwright/test";

test("callback without a valid code fails safely to login with guidance", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page).toHaveURL(/\/login\?error=confirm/);
  await expect(page.getByText(/confirmation link is invalid or expired/)).toBeVisible();

  // An invalid code exchanges unsuccessfully and lands in the same safe state.
  await page.goto("/auth/callback?code=not-a-real-code");
  await expect(page).toHaveURL(/\/login\?error=confirm/);
});

test("legacy site-url links landing on the root are rescued into the callback", async ({
  page,
}) => {
  await page.goto("/?code=63d88e8c-0000-0000-0000-000000000000");
  // Rescue redirect -> callback -> (invalid code) -> login with guidance.
  await expect(page).toHaveURL(/\/login\?error=confirm/, { timeout: 15000 });
});

test("callback next parameter cannot open-redirect", async ({ page }) => {
  await page.goto("/auth/callback?code=bad&next=https://evil.example.com");
  await expect(page).toHaveURL(/localhost:3000\/login\?error=confirm/);
});
