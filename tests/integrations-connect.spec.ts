import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { adminClient, seedOnboardedUser, TEST_PASSWORD } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";
import { testEnv } from "./helpers/env";

/**
 * Google Calendar connect / cancel / disconnect through the mock OAuth path
 * (KODA_INTEGRATIONS_MOCK=1 in playwright.config.ts). The mock short-circuits
 * the consent screen but exercises the real connect route, state cookies,
 * callback, token vault, initial sync, and disconnect cascade.
 */

test("connect happy path stores encrypted tokens the browser can never read @critical", async ({
  page,
}) => {
  const env = testEnv();
  const db = adminClient();
  const { user } = await seedOnboardedUser("gcalconnect");
  await loginViaUi(page, user.email);

  await page.goto("/settings/integrations");
  const calendarCard = page.getByTestId("integration-google_calendar");
  await expect(calendarCard.getByText("Not connected")).toBeVisible();
  await calendarCard.getByRole("link", { name: "Connect Google Calendar" }).click();

  // Mock OAuth round-trips through the real callback and lands back here.
  await expect(page).toHaveURL(/\/settings\/integrations\?connect=ok/);
  await expect(calendarCard.getByText("Connected", { exact: false })).toBeVisible();
  await expect(calendarCard.getByText("Sample calendar (offline mode)")).toBeVisible();

  // Integration row exists and the initial sync imported the mock events.
  const { data: integrations } = await db
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google_calendar");
  expect(integrations).toHaveLength(1);
  expect(integrations![0].status).toBe("connected");

  const { data: events } = await db
    .from("external_events")
    .select("external_id,event_status,classification")
    .eq("user_id", user.id);
  expect(events!.length).toBeGreaterThanOrEqual(3);
  expect(events!.some((e) => e.external_id === "mock-ev-coffee-1")).toBe(true);
  expect(events!.find((e) => e.external_id === "mock-ev-cancelled-1")?.event_status).toBe(
    "cancelled"
  );

  // Tokens exist, encrypted (iv.ct.tag format), via service role...
  const { data: tokens } = await db
    .from("integration_tokens")
    .select("access_token_enc,refresh_token_enc")
    .eq("integration_id", integrations![0].id);
  expect(tokens).toHaveLength(1);
  expect(tokens![0].access_token_enc).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
  expect(tokens![0].access_token_enc).not.toContain("mock-access-token");

  // ...but an authenticated (non-service) client reads ZERO token rows: RLS
  // is enabled with no policies and grants are revoked.
  const authed = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  );
  const { error: signInError } = await authed.auth.signInWithPassword({
    email: user.email,
    password: TEST_PASSWORD,
  });
  expect(signInError).toBeNull();
  const { data: leaked } = await authed.from("integration_tokens").select("*");
  expect(leaked ?? []).toHaveLength(0);

  // Product event recorded (ids/enums only).
  const { data: connectEvents } = await db
    .from("koda_events")
    .select("event_name")
    .eq("user_id", user.id)
    .eq("event_name", "integration_connected");
  expect(connectEvents!.length).toBeGreaterThanOrEqual(1);
});

test("cancelling on the consent screen writes nothing", async ({ page }) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("gcalcancel");
  await loginViaUi(page, user.email);

  // Google sends the user back with error=access_denied when they cancel.
  await page.goto("/api/integrations/google/callback?error=access_denied");
  await expect(page).toHaveURL(/\/settings\/integrations\?connect=cancelled/);
  await expect(page.getByText("nothing was connected")).toBeVisible();

  const { data: integrations } = await db
    .from("integrations")
    .select("id")
    .eq("user_id", user.id);
  expect(integrations ?? []).toHaveLength(0);
  const { data: events } = await db
    .from("external_events")
    .select("id")
    .eq("user_id", user.id);
  expect(events ?? []).toHaveLength(0);
});

test("disconnect deletes tokens and every imported event", async ({ page }) => {
  const db = adminClient();
  const { user } = await seedOnboardedUser("gcaldisconnect");
  await loginViaUi(page, user.email);

  await page.goto("/settings/integrations");
  const calendarCard = page.getByTestId("integration-google_calendar");
  await calendarCard.getByRole("link", { name: "Connect Google Calendar" }).click();
  await expect(page).toHaveURL(/connect=ok/);

  const { data: before } = await db
    .from("external_events")
    .select("id")
    .eq("user_id", user.id);
  expect(before!.length).toBeGreaterThan(0);

  await calendarCard.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("button", { name: "Disconnect and delete data" }).click();
  // Scoped to the calendar card so this waits for the calendar disconnect to
  // land, not the (always disconnected) Gmail card — the delete is async.
  await expect(calendarCard.getByText("Not connected")).toBeVisible();

  const { data: integrations } = await db
    .from("integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "google_calendar");
  expect(integrations ?? []).toHaveLength(0);
  const { data: tokens } = await db
    .from("integration_tokens")
    .select("integration_id")
    .eq("user_id", user.id);
  expect(tokens ?? []).toHaveLength(0);
  const { data: events } = await db
    .from("external_events")
    .select("id")
    .eq("user_id", user.id);
  expect(events ?? []).toHaveLength(0);
});
