import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { testEnv } from "./helpers/env";

// The cron endpoint iterates every scheduled-brief user, so this file runs
// serially and other specs seed manual-frequency users the cron ignores.
test.describe.configure({ mode: "serial" });

const CRON_URL = "/api/cron/brief";

test("scheduled brief run is idempotent, respects consent, and never touches manual users", async ({
  request,
}) => {
  const env = testEnv();
  const db = adminClient();

  // A daily user who consented in-product (no email confirmation: gets in-app
  // briefs but no email) and a manual user who must be untouched.
  const daily = await seedOnboardedUser("crondaily");
  await db
    .from("profiles")
    .update({ autonomous_enabled: true, brief_frequency: "daily" })
    .eq("user_id", daily.user.id);
  const manual = await seedOnboardedUser("cronmanual");

  // Wrong secret is rejected.
  const unauthorized = await request.get(CRON_URL, {
    headers: { authorization: "Bearer wrong-secret" },
  });
  expect(unauthorized.status()).toBe(401);

  // First run creates exactly one scheduled brief with three moves.
  const first = await request.get(CRON_URL, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  const mine = firstBody.results.find(
    (r: { userId: string }) => r.userId === daily.user.id
  );
  expect(mine?.success).toBe(true);
  expect(mine?.skipped).toBeUndefined();

  const { data: briefs1 } = await db
    .from("briefs")
    .select("*")
    .eq("user_id", daily.user.id)
    .eq("source", "scheduled");
  expect(briefs1).toHaveLength(1);
  const { data: moves1 } = await db
    .from("recruiting_moves")
    .select("id,title")
    .eq("brief_id", briefs1![0].id);
  expect(moves1).toHaveLength(3);

  // Scheduled moves must not duplicate what is already on the board.
  const { data: allMoves } = await db
    .from("recruiting_moves")
    .select("title")
    .eq("user_id", daily.user.id);
  const titles = (allMoves ?? []).map((m) => m.title.toLowerCase());
  expect(new Set(titles).size).toBe(titles.length);

  // Second run the same day: clean skip, no new brief, no new moves.
  const second = await request.get(CRON_URL, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(second.status()).toBe(200);
  const secondBody = await second.json();
  const mineAgain = secondBody.results.find(
    (r: { userId: string }) => r.userId === daily.user.id
  );
  expect(mineAgain?.skipped).toBe("already_generated_today");

  const { data: briefs2 } = await db
    .from("briefs")
    .select("id")
    .eq("user_id", daily.user.id)
    .eq("source", "scheduled");
  expect(briefs2).toHaveLength(1);

  // The manual user was never processed.
  const untouched = [firstBody, secondBody].every(
    (body) =>
      !body.results.some((r: { userId: string }) => r.userId === manual.user.id)
  );
  expect(untouched).toBe(true);
  const { data: manualBriefs } = await db
    .from("briefs")
    .select("id")
    .eq("user_id", manual.user.id)
    .eq("source", "scheduled");
  expect(manualBriefs).toHaveLength(0);

  // Event log recorded the run for the daily user.
  const { data: events } = await db
    .from("koda_events")
    .select("event_name,properties")
    .eq("user_id", daily.user.id)
    .eq("event_name", "scheduled_brief_generated");
  expect(events).toHaveLength(1);
  // No confirmed email on file, so the digest must not have been emailed.
  expect((events![0].properties as { emailed: boolean }).emailed).toBe(false);
});

test("move feedback shapes the next scheduled brief", async ({ request }) => {
  const env = testEnv();
  const db = adminClient();
  const { user, moves } = await seedOnboardedUser("cronfeedback");
  await db
    .from("profiles")
    .update({ autonomous_enabled: true, brief_frequency: "daily" })
    .eq("user_id", user.id);

  // Reject the person_to_contact move and accept the proof_of_work move,
  // then backdate today's potential brief claim window by clearing briefs.
  await db.from("recruiting_moves").update({ status: "rejected" }).eq("id", moves[0].id);
  await db.from("recruiting_moves").update({ status: "accepted" }).eq("id", moves[1].id);
  await db.from("move_events").insert([
    { move_id: moves[0].id, user_id: user.id, event_type: "rejected", metadata: {} },
    { move_id: moves[1].id, user_id: user.id, event_type: "accepted", metadata: {} },
  ]);

  const run = await request.get(CRON_URL, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
  });
  expect(run.status()).toBe(200);

  const { data: briefs } = await db
    .from("briefs")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "scheduled");
  expect(briefs).toHaveLength(1);
  const { data: newMoves } = await db
    .from("recruiting_moves")
    .select("title")
    .eq("brief_id", briefs![0].id);
  expect(newMoves).toHaveLength(3);

  // New moves never repeat titles already on the board (dedupe against
  // accepted and rejected history).
  const oldTitles = new Set(moves.map((m: { title: string }) => m.title.toLowerCase()));
  for (const m of newMoves!) {
    expect(oldTitles.has(m.title.toLowerCase())).toBe(false);
  }
});
