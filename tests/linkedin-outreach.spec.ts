import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

/**
 * LinkedIn outreach is copy-paste only: paste a profile URL, edit the
 * capped connection note, copy text, open the profile. No Connect or
 * Send-on-LinkedIn affordance exists anywhere.
 */

test("linkedin outreach panel: URL validation, note cap, copy, and no automation affordance", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const db = adminClient();
  const { user, moves } = await seedOnboardedUser("linkedin");
  const contactMove = moves.find((m: { type: string }) => m.type === "person_to_contact")!;
  await loginViaUi(page, user.email);

  const card = page.locator(".move-card", { hasText: contactMove.title });
  await card.getByRole("button", { name: "Expand details" }).click();
  await expect(card.getByText("LinkedIn outreach")).toBeVisible();
  await expect(
    card.getByText("Koda never connects or messages on LinkedIn. You paste this yourself.")
  ).toBeVisible();

  // Non-LinkedIn URLs are refused server-side.
  await card.getByLabel("LinkedIn profile URL").fill("https://example.com/sam");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("That does not look like a LinkedIn profile URL")).toBeVisible();

  // A real profile URL and a note persist across reloads.
  await card.getByLabel("LinkedIn profile URL").fill("https://www.linkedin.com/in/sam-notion");
  await card.getByLabel("LinkedIn connection note").fill("Hi Sam, we met through the consulting club. I am exploring PM roles and would love to reconnect.");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const { data: saved } = await db
    .from("recruiting_moves")
    .select("person_linkedin_url, connection_note")
    .eq("id", contactMove.id)
    .single();
  expect(saved!.person_linkedin_url).toBe("https://www.linkedin.com/in/sam-notion");
  expect(saved!.connection_note).toContain("consulting club");

  await page.reload();
  const cardAfter = page.locator(".move-card", { hasText: contactMove.title });
  await cardAfter.getByRole("button", { name: "Expand details" }).click();
  await expect(cardAfter.getByLabel("LinkedIn profile URL")).toHaveValue(
    "https://www.linkedin.com/in/sam-notion"
  );
  await expect(cardAfter.getByRole("link", { name: "Open profile ↗" })).toHaveAttribute(
    "href",
    "https://www.linkedin.com/in/sam-notion"
  );

  // The 300-char cap disables saving and shows in the counter.
  await cardAfter.getByLabel("LinkedIn connection note").fill("x".repeat(301));
  await expect(cardAfter.getByText("301/300")).toBeVisible();
  await expect(cardAfter.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Copy fires the whitelisted product event.
  await cardAfter.getByLabel("LinkedIn connection note").fill("Short note");
  await cardAfter.getByRole("button", { name: "Copy note" }).click();
  await expect(page.getByText("Connection note copied")).toBeVisible();
  await expect
    .poll(async () => {
      const { data } = await db
        .from("koda_events")
        .select("properties")
        .eq("user_id", user.id)
        .eq("event_name", "linkedin_outreach_copied");
      return data?.length ?? 0;
    })
    .toBeGreaterThanOrEqual(1);

  // No automation affordance anywhere on the card.
  await expect(cardAfter.getByRole("button", { name: /Connect on LinkedIn/i })).toHaveCount(0);
  await expect(cardAfter.getByRole("button", { name: /Send on LinkedIn/i })).toHaveCount(0);
});
