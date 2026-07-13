import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

/**
 * The sprint's money test: connected source → grounded move with a verified
 * label and live source link → completion feedback → no duplicate on the
 * next run. Runs fully offline (mock AI + mock integrations).
 */

/** Seeded moves are backdated; new generations trip the 2-minute rate limit,
 * so backdate everything before each additional Run Koda. */
async function backdateMoves(userId: string) {
  await adminClient()
    .from("recruiting_moves")
    .update({ created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() })
    .eq("user_id", userId);
}

test("calendar-grounded move: verified badge, source link, no duplicate after completion @critical", async ({
  page,
}) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("grounded");
  await loginViaUi(page, user.email);

  // Connect the (mock) calendar; initial sync imports events.
  await page.goto("/settings/integrations");
  await page.getByRole("link", { name: "Connect Google Calendar" }).click();
  await expect(page).toHaveURL(/connect=ok/);

  // Run Koda: the mock provider must ground its first move in the calendar.
  await page.goto("/inbox");
  await page.getByRole("button", { name: /Run Koda/i }).click();
  const prepCard = page.locator(".move-card", { hasText: /Prep for "/ });
  await expect(prepCard).toBeVisible({ timeout: 20000 });

  // Provenance UI: verified badge, freshness, working source link.
  await prepCard.getByRole("button", { name: "Expand details" }).click();
  await expect(prepCard.getByText("Verified source")).toBeVisible();
  await expect(prepCard.getByText(/checked (just now|\d+[hd] ago)/)).toBeVisible();
  const sourceLink = prepCard.getByRole("link", { name: "View source ↗" });
  await expect(sourceLink).toHaveAttribute("href", /calendar\.google\.com/);

  // The persisted move is linked to the real imported event row.
  const { data: verifiedMoves } = await db
    .from("recruiting_moves")
    .select("id,external_event_id,source_url,source_status")
    .eq("user_id", user.id)
    .eq("source_status", "verified")
    .not("external_event_id", "is", null);
  expect(verifiedMoves!.length).toBeGreaterThanOrEqual(1);
  const firstEventId = verifiedMoves![0].external_event_id;

  // Complete the prep move (with effort calibration), then regenerate.
  await prepCard.getByRole("button", { name: "Mark completed" }).click();
  await prepCard.getByRole("button", { name: /Quick/ }).click();
  await expect(page.locator(".move-card", { hasText: /Prep for "/ })).not.toBeVisible({
    timeout: 15000,
  });

  await backdateMoves(user.id);
  await page.getByRole("button", { name: /Run Koda/i }).click();
  await expect(page.getByText("New recruiting moves generated!")).toBeVisible({
    timeout: 20000,
  });

  // No event ever carries two non-rejected moves.
  const { data: allLinked } = await db
    .from("recruiting_moves")
    .select("external_event_id,status")
    .eq("user_id", user.id)
    .not("external_event_id", "is", null)
    .neq("status", "rejected");
  const linkedIds = allLinked!.map((m) => m.external_event_id);
  expect(new Set(linkedIds).size).toBe(linkedIds.length);
  // And the completed event was not re-suggested.
  expect(linkedIds.filter((id) => id === firstEventId)).toHaveLength(1);
});

test("board-grounded opportunity move carries the live posting URL; removing the board deletes imports", async ({
  page,
}) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("groundedopp");
  await loginViaUi(page, user.email);

  // Add a target-company board (mock validates and imports two postings).
  await page.goto("/settings/integrations");
  await page.getByLabel("Company name").fill("Notion");
  await page.getByRole("button", { name: "Add board" }).click();
  await expect(page.getByText("Watching 1 board")).toBeVisible({ timeout: 15000 });

  const { data: opps } = await db
    .from("external_opportunities")
    .select("id,verification_status,absolute_url")
    .eq("user_id", user.id);
  expect(opps).toHaveLength(2);
  expect(opps!.every((o) => o.verification_status === "verified_live")).toBe(true);

  // Run Koda: the mock provider grounds an opportunity move in a posting.
  await backdateMoves(user.id);
  await page.goto("/inbox");
  await page.getByRole("button", { name: /Run Koda/i }).click();
  const oppCard = page.locator(".move-card", { hasText: /Apply to / });
  await expect(oppCard).toBeVisible({ timeout: 20000 });
  await oppCard.getByRole("button", { name: "Expand details" }).click();
  await expect(oppCard.getByText("Verified source")).toBeVisible();
  await expect(oppCard.getByRole("link", { name: "View source ↗" })).toHaveAttribute(
    "href",
    /example\.com\/boards/
  );

  // Removing the board deletes its imported postings; the move keeps its
  // copied source_url as history but its live link (FK) nulls out.
  await page.goto("/settings/integrations");
  await page.getByRole("button", { name: "Remove Notion board" }).click();
  await expect(page.getByText("No boards yet")).toBeVisible({ timeout: 15000 });

  const { data: oppsAfter } = await db
    .from("external_opportunities")
    .select("id")
    .eq("user_id", user.id);
  expect(oppsAfter ?? []).toHaveLength(0);

  const { data: movesAfter } = await db
    .from("recruiting_moves")
    .select("source_url,external_opportunity_id")
    .eq("user_id", user.id)
    .eq("source_status", "verified")
    .not("source_url", "is", null);
  expect(movesAfter!.length).toBeGreaterThanOrEqual(1);
  expect(movesAfter!.every((m) => m.external_opportunity_id === null)).toBe(true);
  expect(movesAfter![0].source_url).toContain("example.com/boards");
});

test("users with no integrations see today's behavior unchanged", async ({ page }) => {
  const { user } = await seedOnboardedUser("nointeg");
  await loginViaUi(page, user.email);

  await page.goto("/inbox");
  // Seeded board renders normally, with the dismissible recommendation card.
  await expect(page.getByText("Reconnect with Sam at Notion")).toBeVisible();
  await expect(page.getByText("Ground your briefs in your real calendar")).toBeVisible();

  // Dismissal persists across reloads.
  await page.getByRole("button", { name: "Dismiss integration suggestion" }).click();
  await expect(page.getByText("Ground your briefs in your real calendar")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Ground your briefs in your real calendar")).toHaveCount(0);
});
