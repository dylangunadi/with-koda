import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";
import { testEnv } from "./helpers/env";

/**
 * Sync engine behavior: cron auth, duplicate-sync idempotency, forced
 * failure handling, and the reconnect-needed UI state.
 */

const SYNC_CRON_URL = "/api/cron/sync";

/** Seed a connected calendar integration directly (mock mode needs no tokens). */
async function seedCalendarIntegration(userId: string) {
  const db = adminClient();
  const { data, error } = await db
    .from("integrations")
    .insert({
      user_id: userId,
      provider: "google_calendar",
      status: "connected",
      account_label: "Sample calendar (offline mode)",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    })
    .select()
    .single();
  if (error || !data) throw new Error(`seed integration failed: ${error?.message}`);
  return data;
}

test("scheduled sync requires the cron secret and is idempotent per day", async ({
  request,
}) => {
  const env = testEnv();
  const db = adminClient();
  const { user } = await seedOnboardedUser("synccron");
  const integration = await seedCalendarIntegration(user.id);

  const unauthorized = await request.get(SYNC_CRON_URL);
  expect(unauthorized.status()).toBe(401);

  // First scheduled run imports the mock events.
  const first = await request.get(SYNC_CRON_URL, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  const mine = firstBody.results.find(
    (r: { integrationId: string }) => r.integrationId === integration.id
  );
  expect(mine?.success).toBe(true);
  expect(mine?.skipped).toBeUndefined();

  const { data: events1 } = await db
    .from("external_events")
    .select("id")
    .eq("user_id", user.id);
  const countAfterFirst = events1!.length;
  expect(countAfterFirst).toBeGreaterThan(0);

  // Second run the same day: clean skip, event count unchanged.
  const second = await request.get(SYNC_CRON_URL, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(second.status()).toBe(200);
  const secondBody = await second.json();
  const mineAgain = secondBody.results.find(
    (r: { integrationId: string }) => r.integrationId === integration.id
  );
  expect(mineAgain?.skipped).toBe("already_synced_today");

  const { data: events2 } = await db
    .from("external_events")
    .select("id")
    .eq("user_id", user.id);
  expect(events2!.length).toBe(countAfterFirst);

  // Exactly one scheduled run row exists for today.
  const { data: runs } = await db
    .from("integration_sync_runs")
    .select("id,status")
    .eq("integration_id", integration.id)
    .eq("trigger", "scheduled");
  expect(runs).toHaveLength(1);
  expect(runs![0].status).toBe("ok");
});

test("manual sync failure is recorded without crashing, and reconnect state renders", async ({
  page,
}) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("syncfail");
  const integration = await seedCalendarIntegration(user.id);
  await loginViaUi(page, user.email);

  // Forced failure (mock-only test header): 502, failed run recorded,
  // integration keeps its data and records the error.
  const failed = await page.request.post("/api/integrations/sync", {
    headers: { "x-koda-test-integration": "fail" },
    data: { provider: "google_calendar" },
  });
  expect(failed.status()).toBe(502);

  const { data: runs } = await db
    .from("integration_sync_runs")
    .select("status,error")
    .eq("integration_id", integration.id)
    .eq("trigger", "manual");
  expect(runs).toHaveLength(1);
  expect(runs![0].status).toBe("failed");

  const { data: after } = await db
    .from("integrations")
    .select("last_sync_error")
    .eq("id", integration.id)
    .single();
  expect(after!.last_sync_error).toBeTruthy();

  // Manual sync is rate limited: an immediate retry answers 429, not a rerun.
  const retry = await page.request.post("/api/integrations/sync", {
    data: { provider: "google_calendar" },
  });
  expect(retry.status()).toBe(429);

  // Reconnect-needed state (what an expired/revoked grant produces) renders
  // as a calm reconnect card, not an error dead end.
  await db
    .from("integrations")
    .update({ status: "error", last_sync_error: "reconnect_required" })
    .eq("id", integration.id);
  await page.goto("/settings/integrations");
  await expect(page.getByText("Reconnect needed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reconnect Google Calendar" })).toBeVisible();
});
