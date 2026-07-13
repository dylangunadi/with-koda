import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("profile edits never revoke scheduled-brief consent", async ({ page }) => {
  const { user } = await seedOnboardedUser("settingsconsent");
  const db = adminClient();
  // Enrolled at onboarding review: weekly in-app briefs, no email digest.
  await db
    .from("profiles")
    .update({ autonomous_enabled: true, brief_frequency: "weekly" })
    .eq("user_id", user.id);

  await loginViaUi(page, user.email);
  await page.goto("/settings");
  await expect(page.getByLabel("Name")).toHaveValue("Seeded Tester", { timeout: 15000 });

  // Edit an unrelated profile field and save.
  await page.getByLabel("Name").fill("Renamed Tester");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile saved successfully.")).toBeVisible({ timeout: 15000 });

  const { data: profile } = await db
    .from("profiles")
    .select("name,autonomous_enabled,brief_frequency")
    .eq("user_id", user.id)
    .single();
  expect(profile!.name).toBe("Renamed Tester");
  expect(profile!.autonomous_enabled).toBe(true); // consent untouched
  expect(profile!.brief_frequency).toBe("weekly");
});

test("manual user can enable in-app scheduled briefs without an email", async ({ page }) => {
  const { user } = await seedOnboardedUser("settingsenable");
  await loginViaUi(page, user.email);
  await page.goto("/settings");
  await expect(page.getByLabel("Name")).toBeVisible({ timeout: 15000 });

  await page.getByRole("switch").click(); // turn scheduled briefs on
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile saved successfully.")).toBeVisible({ timeout: 15000 });

  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("autonomous_enabled,brief_frequency,brief_email,brief_confirmed")
    .eq("user_id", user.id)
    .single();
  expect(profile!.autonomous_enabled).toBe(true);
  expect(profile!.brief_frequency).toBe("daily"); // UI default, not 'manual'
  expect(profile!.brief_email).toBeNull(); // no digest without opt-in
  expect(profile!.brief_confirmed).toBe(false);

  // Turning it off maps back to manual.
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile saved successfully.")).toBeVisible({ timeout: 15000 });
  const { data: after } = await db
    .from("profiles")
    .select("autonomous_enabled,brief_frequency")
    .eq("user_id", user.id)
    .single();
  expect(after!.autonomous_enabled).toBe(false);
  expect(after!.brief_frequency).toBe("manual");
});
