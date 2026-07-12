import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("@critical move actions persist across reload and there is no Send action", async ({
  page,
}) => {
  const { user, moves } = await seedOnboardedUser("actions");
  await loginViaUi(page, user.email);

  // No send affordance anywhere: accepting must never claim external action.
  await expect(page.getByRole("button", { name: /^Sent$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Send$/ })).toHaveCount(0);

  const [moveA, moveB, moveC] = moves;
  const cardA = page.locator(".move-card", { hasText: moveA.title });
  const cardB = page.locator(".move-card", { hasText: moveB.title });
  const cardC = page.locator(".move-card", { hasText: moveC.title });

  // Accept move A: stays in Today with an Accepted chip, nothing "sent".
  await cardA.getByRole("button", { name: "Accept move" }).click();
  await expect(cardA.getByText("Accepted", { exact: true })).toBeVisible();
  await expect(cardA.getByRole("button", { name: "Accept move" })).toHaveCount(0);

  // Save move B for later.
  await cardB.getByRole("button", { name: "Save for later" }).click();
  await expect(page.locator(".move-card", { hasText: moveB.title })).toHaveCount(0);

  // Mark move C not relevant.
  await cardC.getByRole("button", { name: "Not relevant" }).click();
  await expect(page.locator(".move-card", { hasText: moveC.title })).toHaveCount(0);

  // Reload: states persist into the right tabs.
  await page.reload();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: /Saved/ }).click();
  await expect(page.locator(".move-card", { hasText: moveB.title })).toBeVisible();

  await page.getByRole("tab", { name: /Not relevant/ }).click();
  await expect(page.locator(".move-card", { hasText: moveC.title })).toBeVisible();

  // Accept -> complete transition: completion is distinct from acceptance.
  await page.getByRole("tab", { name: /Today/ }).click();
  await cardA.getByRole("button", { name: "Mark completed" }).click();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toHaveCount(0);
  await page.getByRole("tab", { name: /Completed/ }).click();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toBeVisible();
  await expect(page.getByText("Completed. Koda uses this to shape your next brief.")).toBeVisible();

  // Reload again: completed state persists.
  await page.reload();
  await page.getByRole("tab", { name: /Completed/ }).click();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toBeVisible();

  // Database truth: statuses and the acceptance-then-completion event trail.
  const db = adminClient();
  const { data: rows } = await db
    .from("recruiting_moves")
    .select("id,status")
    .eq("user_id", user.id);
  const byId = new Map((rows ?? []).map((r) => [r.id, r.status]));
  expect(byId.get(moveA.id)).toBe("completed");
  expect(byId.get(moveB.id)).toBe("saved");
  expect(byId.get(moveC.id)).toBe("rejected");

  const { data: events } = await db
    .from("move_events")
    .select("event_type")
    .eq("move_id", moveA.id)
    .order("created_at", { ascending: true });
  const eventTypes = (events ?? []).map((e) => e.event_type);
  expect(eventTypes).toContain("accepted");
  expect(eventTypes).toContain("completed");

  // API refuses the legacy 'sent' status outright.
  const response = await page.request.patch(`/api/moves/${moveA.id}`, {
    data: { status: "sent" },
  });
  expect(response.status()).toBe(400);
});

test("draft edits persist and log an edited event", async ({ page }) => {
  const { user, moves } = await seedOnboardedUser("draft");
  await loginViaUi(page, user.email);

  const card = page.locator(".move-card", { hasText: moves[0].title });
  await card.getByRole("button", { name: "Expand details" }).click();
  const textarea = card.getByRole("textbox");
  await textarea.fill("Hi Sam, quick update from me.");
  await card.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();

  await page.reload();
  const cardAfter = page.locator(".move-card", { hasText: moves[0].title });
  await cardAfter.getByRole("button", { name: "Expand details" }).click();
  await expect(cardAfter.getByRole("textbox")).toHaveValue("Hi Sam, quick update from me.");

  const db = adminClient();
  const { data: events } = await db
    .from("move_events")
    .select("event_type")
    .eq("move_id", moves[0].id);
  expect((events ?? []).map((e) => e.event_type)).toContain("edited");
});
