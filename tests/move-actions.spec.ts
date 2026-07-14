import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("@critical move actions persist, calibrate effort, and the API rejects a client-set 'sent' status", async ({
  page,
}) => {
  const { user, moves } = await seedOnboardedUser("actions");
  await loginViaUi(page, user.email);

  // Seeded moves are not thread-grounded, so no Send affordance renders here:
  // sending exists only on Gmail-grounded moves (see gmail-integration spec).
  await expect(page.getByRole("button", { name: /^Sent$/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Send$/ })).toHaveCount(0);
  // The dominant CTA is completion, not acceptance.
  await expect(page.getByRole("button", { name: "Accept move" })).toHaveCount(0);

  const [moveA, moveB, moveC] = moves;
  const cardA = page.locator(".move-card", { hasText: moveA.title });
  const cardB = page.locator(".move-card", { hasText: moveB.title });
  const cardC = page.locator(".move-card", { hasText: moveC.title });

  // Complete move A, reporting the actual effort bucket.
  await cardA.getByRole("button", { name: "Mark completed" }).click();
  await expect(cardA.getByText("How long did it actually take?")).toBeVisible();
  await cardA.getByRole("button", { name: /Quick/ }).click();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toHaveCount(0);

  // Save move B for later.
  await cardB.getByRole("button", { name: "Save for later" }).click();
  await expect(page.locator(".move-card", { hasText: moveB.title })).toHaveCount(0);

  // Reject move C with optional feedback.
  await cardC.getByRole("button", { name: "Not relevant" }).click();
  await cardC.getByLabel("Why is this move not relevant").fill("Wrong company for me");
  await cardC.getByRole("button", { name: "Remove move" }).click();
  await expect(page.locator(".move-card", { hasText: moveC.title })).toHaveCount(0);

  // Reload: states persist into the right tabs.
  await page.reload();
  await page.getByRole("tab", { name: /Completed/ }).click();
  await expect(page.locator(".move-card", { hasText: moveA.title })).toBeVisible();
  await expect(page.getByText("Completed. Koda uses this to shape your next brief.")).toBeVisible();

  await page.getByRole("tab", { name: /Saved/ }).click();
  await expect(page.locator(".move-card", { hasText: moveB.title })).toBeVisible();

  await page.getByRole("tab", { name: /Not relevant/ }).click();
  await expect(page.locator(".move-card", { hasText: moveC.title })).toBeVisible();

  // Database truth: statuses, calibration, and feedback all captured.
  const db = adminClient();
  const { data: rows } = await db
    .from("recruiting_moves")
    .select("id,status,actual_effort_bucket")
    .eq("user_id", user.id);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  expect(byId.get(moveA.id)?.status).toBe("completed");
  expect(byId.get(moveA.id)?.actual_effort_bucket).toBe("quick");
  expect(byId.get(moveB.id)?.status).toBe("saved");
  expect(byId.get(moveC.id)?.status).toBe("rejected");

  const { data: rejectedEvents } = await db
    .from("move_events")
    .select("event_type,metadata")
    .eq("move_id", moveC.id)
    .eq("event_type", "rejected");
  expect(rejectedEvents).toHaveLength(1);
  expect((rejectedEvents![0].metadata as { feedback?: string }).feedback).toBe(
    "Wrong company for me"
  );

  const { data: completedEvents } = await db
    .from("move_events")
    .select("metadata")
    .eq("move_id", moveA.id)
    .eq("event_type", "completed");
  expect((completedEvents![0].metadata as { actual_effort_bucket?: string }).actual_effort_bucket).toBe(
    "quick"
  );

  // API refuses the legacy 'sent' status outright.
  const response = await page.request.patch(`/api/moves/${moveA.id}`, {
    data: { status: "sent" },
  });
  expect(response.status()).toBe(400);
});

test("completion effort can be skipped and rejection feedback is optional", async ({ page }) => {
  const { user, moves } = await seedOnboardedUser("optional");
  await loginViaUi(page, user.email);

  const cardA = page.locator(".move-card", { hasText: moves[0].title });
  await cardA.getByRole("button", { name: "Mark completed" }).click();
  await cardA.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator(".move-card", { hasText: moves[0].title })).toHaveCount(0);

  const cardB = page.locator(".move-card", { hasText: moves[1].title });
  await cardB.getByRole("button", { name: "Not relevant" }).click();
  // Changed their mind: Keep it leaves the move untouched.
  await cardB.getByRole("button", { name: "Keep it" }).click();
  await expect(cardB.getByRole("button", { name: "Mark completed" })).toBeVisible();
  // Reject without feedback.
  await cardB.getByRole("button", { name: "Not relevant" }).click();
  await cardB.getByRole("button", { name: "Remove move" }).click();
  await expect(page.locator(".move-card", { hasText: moves[1].title })).toHaveCount(0);

  const db = adminClient();
  const { data: rows } = await db
    .from("recruiting_moves")
    .select("id,status,actual_effort_bucket")
    .eq("user_id", user.id);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  expect(byId.get(moves[0].id)?.status).toBe("completed");
  expect(byId.get(moves[0].id)?.actual_effort_bucket).toBeNull();
  expect(byId.get(moves[1].id)?.status).toBe("rejected");
});

test("draft edits persist and log an edited event", async ({ page }) => {
  const { user, moves } = await seedOnboardedUser("draft");
  await loginViaUi(page, user.email);

  const card = page.locator(".move-card", { hasText: moves[0].title });
  await card.getByRole("button", { name: "Expand details" }).click();
  await card.getByLabel("Outreach draft").fill("Hi Sam, quick update from me.");
  await card.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();

  await page.reload();
  const cardAfter = page.locator(".move-card", { hasText: moves[0].title });
  await cardAfter.getByRole("button", { name: "Expand details" }).click();
  await expect(cardAfter.getByLabel("Outreach draft")).toHaveValue("Hi Sam, quick update from me.");

  const db = adminClient();
  const { data: events } = await db
    .from("move_events")
    .select("event_type")
    .eq("move_id", moves[0].id);
  expect((events ?? []).map((e) => e.event_type)).toContain("edited");
});
