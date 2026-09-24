import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("settings edits the same profile fields chat onboarding writes", async ({ page }) => {
  const { user } = await seedOnboardedUser("settingsfields");
  await loginViaUi(page, user.email);
  await page.goto("/settings");

  // Loaded from the onboarding-written columns.
  await expect(page.getByLabel("Recruiting stage")).toHaveValue("actively applying", { timeout: 15000 });
  await expect(page.getByLabel("People you already know")).toHaveValue(
    "Knows a PM named Sam at Notion via consulting club"
  );
  await expect(page.getByLabel("What success looks like")).toHaveValue("Signed summer internship offer");

  // Legacy fields are gone.
  await expect(page.getByLabel("LinkedIn URL")).toHaveCount(0);
  await expect(page.getByLabel("Industries")).toHaveCount(0);
  await expect(page.getByLabel("Resume")).toHaveCount(0);

  await page.getByLabel("Timing and deadlines").fill("offer by March");
  await page.getByLabel("Target companies (comma separated)").fill("Figma, Ramp");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText("Profile saved successfully.")).toBeVisible({ timeout: 15000 });

  const { data: profile } = await adminClient()
    .from("profiles")
    .select("timeline,target_companies,contacts_notes")
    .eq("user_id", user.id)
    .single();
  expect(profile!.timeline).toBe("offer by March");
  expect(profile!.target_companies).toEqual(["Figma", "Ramp"]);
  expect(profile!.contacts_notes).toBe("Knows a PM named Sam at Notion via consulting club");
});
