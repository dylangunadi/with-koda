import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("relationship context is extracted, confirmed, and persisted with the original message", async ({
  page,
}) => {
  const { user } = await seedOnboardedUser("context");
  await loginViaUi(page, user.email);
  await page.goto("/talk");
  await expect(page.getByText("What happened since we last talked?")).toBeVisible();

  const original =
    "I spoke to Maya at Notion yesterday, she's a product manager and told me to follow up in 2 weeks";
  await page.getByLabel("Message Koda").fill(original);
  await page.getByRole("button", { name: "Send" }).click();

  // Structured extraction shown for confirmation; nothing saved yet.
  await expect(page.getByText("Save to memory?")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Maya/).first()).toBeVisible();
  const db = adminClient();
  const { data: before } = await db.from("relationships").select("id").eq("user_id", user.id);
  expect(before).toHaveLength(0);

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Saved. Future briefs use this.")).toBeVisible();

  // Persisted structurally, original message preserved verbatim.
  const { data: rows } = await db.from("relationships").select("*").eq("user_id", user.id);
  expect(rows).toHaveLength(1);
  expect(rows![0].person_name).toBe("Maya");
  expect(rows![0].organization).toBe("Notion");
  expect(rows![0].source_message).toBe(original);
  expect(rows![0].follow_up_date).toBeTruthy();

  // Survives refresh: memory and resolution state persist.
  await page.reload();
  await expect(page.getByText("Saved. Future briefs use this.")).toBeVisible();

  // Future brief context includes the relationship: ask for the next move.
  await page.getByLabel("Message Koda").fill("What should I do next?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/following up with Maya/).first()).toBeVisible({ timeout: 15000 });
});

test("declining a relationship proposal writes nothing", async ({ page }) => {
  const { user } = await seedOnboardedUser("decline");
  await loginViaUi(page, user.email);
  await page.goto("/talk");

  await page.getByLabel("Message Koda").fill("I met Chris at Stripe today for coffee");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Save to memory?")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Not saved.")).toBeVisible();

  const db = adminClient();
  const { data: rows } = await db.from("relationships").select("id").eq("user_id", user.id);
  expect(rows).toHaveLength(0);
});

test("goal updates show a diff, persist only after confirmation, and feed the next brief", async ({
  page,
}) => {
  const { user } = await seedOnboardedUser("goalupdate");
  await loginViaUi(page, user.email);
  await page.goto("/talk");

  await page
    .getByLabel("Message Koda")
    .fill("I'm no longer interested in consulting, I am now targeting data science roles in New York");
  await page.getByRole("button", { name: "Send" }).click();

  // Proposed diff with old and new values; profile untouched until confirm.
  await expect(page.getByText("Update your profile?")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Product management")).toBeVisible(); // old value shown
  await expect(page.getByText(/data science/).first()).toBeVisible();
  const db = adminClient();
  const { data: preProfile } = await db
    .from("profiles")
    .select("target_roles")
    .eq("user_id", user.id)
    .single();
  expect(preProfile!.target_roles).toEqual(["Product management"]);

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Saved. Future briefs use this.")).toBeVisible();

  const { data: postProfile } = await db
    .from("profiles")
    .select("target_roles,locations")
    .eq("user_id", user.id)
    .single();
  expect(postProfile!.target_roles).toContain("data science");
  expect(postProfile!.locations).toContain("New York");

  // The next brief uses the updated goal (mock provider grounds moves in the
  // stated profile, so the new role must appear).
  const generate = await page.request.post("/api/moves/generate");
  expect(generate.status()).toBe(200);
  const { moves } = await generate.json();
  const allText = JSON.stringify(moves);
  expect(allText).toContain("data science");
  // The abandoned target role must not drive any new move. (The word
  // "consulting" can still appear inside the user's own quoted contact notes,
  // which is correct grounding, so assert on the old role instead.)
  expect(allText).not.toContain("Product management");
});

test("declining a goal update leaves the profile untouched", async ({ page }) => {
  const { user } = await seedOnboardedUser("goaldecline");
  await loginViaUi(page, user.email);
  await page.goto("/talk");

  await page.getByLabel("Message Koda").fill("I'm now targeting design roles in Chicago");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Update your profile?")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByText("Not saved.")).toBeVisible();

  const db = adminClient();
  const { data: profile } = await db
    .from("profiles")
    .select("target_roles")
    .eq("user_id", user.id)
    .single();
  expect(profile!.target_roles).toEqual(["Product management"]);
});

test("asking for the next move uses saved data and stays concrete", async ({ page }) => {
  const { user, moves } = await seedOnboardedUser("nextmove");
  await loginViaUi(page, user.email);
  await page.goto("/talk");

  await page.getByLabel("Message Koda").fill("What should I do next?");
  await page.getByRole("button", { name: "Send" }).click();

  // Reply must reference a real seeded entity (a move on the board), and no
  // confirmation card appears for a plain recommendation.
  await expect(page.getByText(new RegExp(moves[0].title.slice(0, 20))).first()).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("Save to memory?")).toHaveCount(0);

  // Streaming shows text before the turn persists, so poll for the event.
  const db = adminClient();
  await expect
    .poll(
      async () => {
        const { data: events } = await db
          .from("koda_events")
          .select("event_name")
          .eq("user_id", user.id);
        return (events ?? []).map((e) => e.event_name);
      },
      { timeout: 10000 }
    )
    .toContain("next_move_requested");
});
