import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

/**
 * Gmail loop in mock mode: connect through the real OAuth routes, import
 * query-scoped threads, get a grounded reply move, create a Gmail draft on
 * explicit click (never send), and disconnect with full deletion.
 */

test("gmail connect imports threads and grounds a reply move with draft creation @critical", async ({
  page,
}) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("gmailloop");
  await loginViaUi(page, user.email);

  // Connect Gmail via the mock consent shortcut (real connect/callback path).
  await page.goto("/settings/integrations");
  await page.getByRole("link", { name: "Connect Gmail" }).click();
  await expect(page).toHaveURL(/connect=ok/);
  await expect(page.getByText("student@example.com (offline mode)")).toBeVisible();

  // Initial sync imported the mock threads with correct reply state, and the
  // integration stored a visible, user-scoped search query (never full-mailbox).
  const { data: threads } = await db
    .from("external_threads")
    .select("external_id, needs_reply")
    .eq("user_id", user.id);
  expect(threads).toHaveLength(2);
  const recruiterThread = threads!.find((t) => t.external_id === "mock-th-recruiter-1");
  const answeredThread = threads!.find((t) => t.external_id === "mock-th-answered-1");
  expect(recruiterThread?.needs_reply).toBe(true);
  expect(answeredThread?.needs_reply).toBe(false);

  const { data: integration } = await db
    .from("integrations")
    .select("id, config")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .single();
  expect(integration!.config.queries?.length).toBeGreaterThan(0);

  // Run Koda: the mock provider grounds a reply move in the waiting thread.
  await page.goto("/inbox");
  await page.getByRole("button", { name: /Run Koda/i }).click();
  const replyCard = page.locator(".move-card", { hasText: /Reply to "/ });
  await expect(replyCard).toBeVisible({ timeout: 20000 });

  await replyCard.getByRole("button", { name: "Expand details" }).click();
  await expect(replyCard.getByText("Verified source")).toBeVisible();
  await expect(replyCard.getByRole("link", { name: "View source ↗" })).toHaveAttribute(
    "href",
    /mail\.google\.com/
  );

  // Explicit-approval draft creation: lands in Drafts, never sends. No Send
  // affordance exists anywhere on the card.
  await expect(replyCard.getByRole("button", { name: /^Send/ })).toHaveCount(0);
  await replyCard.getByRole("button", { name: "Create Gmail draft" }).click();
  await expect(page.getByText("Draft saved to your Gmail")).toBeVisible({ timeout: 15000 });

  const { data: draftEvents } = await db
    .from("koda_events")
    .select("event_name")
    .eq("user_id", user.id)
    .eq("event_name", "gmail_draft_created");
  expect(draftEvents).toHaveLength(1);

  // Disconnect deletes every imported thread; the move keeps its copied
  // permalink as history with the live link nulled. Gmail is this user's
  // only connected integration, so exactly one Disconnect button exists.
  await page.goto("/settings/integrations");
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByText("Disconnect Gmail?")).toBeVisible();
  await page.getByRole("button", { name: "Disconnect and delete data" }).click();
  await expect(page.getByText("Disconnected. Everything Koda imported was deleted.")).toBeVisible();

  const { data: threadsAfter } = await db
    .from("external_threads")
    .select("id")
    .eq("user_id", user.id);
  expect(threadsAfter ?? []).toHaveLength(0);

  const { data: movesAfter } = await db
    .from("recruiting_moves")
    .select("source_url, external_thread_id")
    .eq("user_id", user.id)
    .not("source_url", "is", null);
  expect(movesAfter!.length).toBeGreaterThanOrEqual(1);
  expect(movesAfter!.every((m) => m.external_thread_id === null)).toBe(true);
});
