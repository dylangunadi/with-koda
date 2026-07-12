import { test, expect } from "@playwright/test";
import { seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("@critical returning onboarded user bypasses onboarding and sees the saved brief", async ({
  page,
}) => {
  const { user, moves } = await seedOnboardedUser("returning");

  await loginViaUi(page, user.email);

  // Straight to the inbox, never back through onboarding.
  await expect(page).toHaveURL(/\/inbox/);
  await expect(page.getByText("Koda Brief", { exact: true })).toBeVisible();
  await expect(page.getByText("3 moves")).toBeVisible();
  for (const move of moves) {
    await expect(page.getByText(move.title)).toBeVisible();
  }

  // An obvious way to talk to Koda again.
  await expect(page.getByRole("link", { name: "Talk to Koda" }).first()).toBeVisible();

  // Visiting /talk does not restart onboarding for an onboarded user.
  await page.goto("/talk");
  await expect(page).toHaveURL(/\/inbox/);

  // No unexplained blank state after reload.
  await page.reload();
  await expect(page.getByText("Koda Brief", { exact: true })).toBeVisible();
});
