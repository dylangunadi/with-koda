import { test, expect } from "@playwright/test";
import { adminClient, uniqueEmail } from "./helpers/db";
import { signupViaUi } from "./helpers/auth";

// Deliberately distinctive strings: if any of them ever shows up inside
// koda_events.properties, raw user content is leaking into analytics.
const SENSITIVE = {
  name: "Zephyrine",
  school: "Xanadu Polytechnic",
  contact: "Quixote Barnaby",
  workAuth: "H-1B sponsorship needed",
  project: "octopus-scheduling-engine",
};

const ANSWERS = [
  `I'm ${SENSITIVE.name}, a junior at ${SENSITIVE.school}`,
  "Product management",
  "Notion",
  "Just starting",
  "Internship by November",
  `SF, ${SENSITIVE.workAuth}`,
  `I know ${SENSITIVE.contact}, a recruiter from my old internship`,
  `I built the ${SENSITIVE.project} with 2k users`,
  "A signed internship offer",
];

test("activation flow records product events without leaking user content", async ({ page }) => {
  const email = uniqueEmail("instrumentation");
  await signupViaUi(page, email);

  for (let i = 0; i < ANSWERS.length; i++) {
    await page.getByLabel("Message Koda").fill(ANSWERS[i]);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page
        .locator(`[data-onboarding-remaining="${9 - (i + 1)}"]`)
        .or(page.getByRole("heading", { name: "Here is what Koda learned" }))
        .first()
    ).toBeAttached({ timeout: 15000 });
  }

  // Edit a review field (fires profile_review_edited), keep Manual, confirm.
  await page.getByLabel("Target companies (comma separated)").fill("Notion, Linear");
  await page.getByRole("button", { name: "Confirm and build my first brief" }).click();
  await expect(page).toHaveURL(/\/inbox/, { timeout: 20000 });

  // Take one action on a move: the activation definition's third leg.
  const firstCard = page.locator(".move-card").first();
  await firstCard.getByRole("button", { name: "Mark completed" }).click();
  await firstCard.getByRole("button", { name: /Quick/ }).click();
  await expect(page.getByRole("tab", { name: /Completed/ })).toContainText("1");

  const db = adminClient();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === email);
  expect(user).toBeTruthy();

  const { data: events } = await db
    .from("koda_events")
    .select("event_name,properties")
    .eq("user_id", user!.id);
  const names = (events ?? []).map((e) => e.event_name);

  // The full activation trail exists.
  for (const expected of [
    "onboarding_started",
    "onboarding_message_submitted",
    "onboarding_completed",
    "brief_preference_set",
    "profile_review_edited",
    "first_brief_generation_started",
    "first_brief_generated",
    "move_completed",
  ]) {
    expect(names, `expected event ${expected}`).toContain(expected);
  }

  // Activation events are singular even though requests can be repeated.
  expect(names.filter((n) => n === "onboarding_completed")).toHaveLength(1);
  expect(names.filter((n) => n === "first_brief_generated")).toHaveLength(1);

  // Privacy: no raw user content in any event properties.
  const allProperties = JSON.stringify((events ?? []).map((e) => e.properties));
  for (const [label, value] of Object.entries(SENSITIVE)) {
    expect(allProperties, `sensitive ${label} leaked into analytics`).not.toContain(value);
  }
  // Message text and drafts must not appear either.
  for (const answer of ANSWERS) {
    expect(allProperties).not.toContain(answer);
  }
});
