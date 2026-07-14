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

  // Explicit-approval draft creation: lands in Drafts.
  await replyCard.getByRole("button", { name: "Create Gmail draft" }).click();
  await expect(page.getByText("Draft saved to your Gmail")).toBeVisible({ timeout: 15000 });

  const { data: draftEvents } = await db
    .from("koda_events")
    .select("event_name")
    .eq("user_id", user.id)
    .eq("event_name", "gmail_draft_created");
  expect(draftEvents).toHaveLength(1);

  // A forced provider failure (test-only header) fires before the
  // idempotency claim: nothing is marked sent, so a retry stays possible.
  const { data: pendingMove } = await db
    .from("recruiting_moves")
    .select("id")
    .eq("user_id", user.id)
    .not("external_thread_id", "is", null)
    .single();
  const forced = await page.request.post("/api/integrations/gmail/send", {
    headers: { "x-koda-test-integration": "fail" },
    data: { move_id: pendingMove!.id },
  });
  expect(forced.status()).toBe(502);
  const { data: afterForced } = await db
    .from("recruiting_moves")
    .select("gmail_sent_at")
    .eq("id", pendingMove!.id)
    .single();
  expect(afterForced!.gmail_sent_at).toBeNull();

  // Explicit send: the confirm dialog shows the server's own preview of
  // exactly what will go out, and sending happens once on confirm.
  await replyCard.getByRole("button", { name: "Send via Gmail" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("jamie.wu@stripe.com")).toBeVisible({ timeout: 15000 });
  await expect(dialog.getByText("Re: APM application at Stripe")).toBeVisible();
  await dialog.getByRole("button", { name: "Send via Gmail" }).click();
  await expect(page.getByText("Sent from your Gmail.")).toBeVisible({ timeout: 15000 });

  const { data: sentMove } = await db
    .from("recruiting_moves")
    .select("id, status, gmail_sent_at, gmail_message_id")
    .eq("user_id", user.id)
    .not("gmail_sent_at", "is", null)
    .single();
  expect(sentMove!.status).toBe("completed");
  expect(sentMove!.gmail_message_id).toBe("mock-sent-1");

  const { data: sentEvents } = await db
    .from("move_events")
    .select("event_type")
    .eq("move_id", sentMove!.id)
    .eq("event_type", "sent");
  expect(sentEvents).toHaveLength(1);
  const { data: sentKodaEvents } = await db
    .from("koda_events")
    .select("event_name")
    .eq("user_id", user.id)
    .eq("event_name", "gmail_message_sent");
  expect(sentKodaEvents).toHaveLength(1);

  // Idempotency: a second send attempt is refused, never a second email.
  const again = await page.request.post("/api/integrations/gmail/send", {
    data: { move_id: sentMove!.id },
  });
  expect(again.status()).toBe(409);

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
