import { test, expect } from "@playwright/test";
import { adminClient, uniqueEmail } from "./helpers/db";
import { signupViaUi } from "./helpers/auth";

const ANSWERS = [
  "I'm Jordan, a junior at UC Berkeley",
  "Product management and growth roles",
  "Notion, Linear, and Anthropic",
  "Just starting out",
  "I need an internship locked by end of November",
  "SF or New York, I'm a US citizen so no visa issues",
  "I know a Cal alum named Sam who is a PM at Notion from my consulting club",
  "I built a course planner app with 2k users and led growth for the club newsletter",
  "A signed summer internship offer at a product-led startup",
];

async function answer(page: import("@playwright/test").Page, text: string, expectedCovered: number) {
  await page.getByLabel("Message Koda").fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(
    page
      .getByText(`${expectedCovered} of 9 covered`)
      .or(page.getByRole("heading", { name: "Here is what Koda learned" }))
  ).toBeVisible({ timeout: 15000 });
}

test("@critical new user enters Talk to Koda, completes onboarding, gets a persisted first brief", async ({
  page,
}) => {
  const email = uniqueEmail("onboarding");

  // 1. Signup routes into Talk to Koda, never an empty dashboard.
  await signupViaUi(page, email);
  await expect(page.getByText("I am Koda")).toBeVisible();
  await expect(page.getByText("0 of 9 covered")).toBeVisible();

  // 2. Answer the first half of the conversation.
  for (let i = 0; i < 4; i++) {
    await answer(page, ANSWERS[i], i + 1);
  }

  // 3. Refresh mid-conversation: state must resume, nothing lost.
  await page.reload();
  await expect(page.getByText("Resumed. Nothing you said was lost.")).toBeVisible();
  await expect(page.getByText("4 of 9 covered")).toBeVisible();
  await expect(page.getByText(ANSWERS[3])).toBeVisible(); // transcript preserved

  // Structured persistence (not just a transcript): extracted jsonb has fields.
  const db = adminClient();
  const { data: allUsers } = await db.auth.admin.listUsers({ perPage: 200 });
  const testUser = allUsers.users.find((u) => u.email === email);
  expect(testUser).toBeTruthy();
  const { data: mine } = await db
    .from("koda_conversations")
    .select("extracted,status")
    .eq("user_id", testUser!.id)
    .eq("status", "active")
    .single();
  expect(mine, "extracted onboarding state persisted as structured fields").toBeTruthy();
  expect((mine!.extracted as Record<string, unknown>).name).toBe("Jordan");
  expect((mine!.extracted as Record<string, unknown>).target_roles).toEqual([
    "Product management",
    "growth roles",
  ]);

  // 4. Finish the conversation.
  for (let i = 4; i < 9; i++) {
    await answer(page, ANSWERS[i], i + 1);
  }

  // 5. Review screen shows what Koda learned, editable.
  await expect(page.getByText("Here is what Koda learned")).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Name")).toHaveValue("Jordan");
  await expect(page.getByLabel("School")).toHaveValue("UC Berkeley");

  // Edit a field and pick a schedule.
  await page.getByLabel("Target companies (comma separated)").fill("Notion, Linear, Anthropic, Figma");
  await page.getByText("Weekly brief", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /Weekly brief/ })).toBeChecked();
  await page.getByRole("button", { name: "Confirm and build my first brief" }).click();

  // 6. First brief lands in the inbox: exactly three moves.
  await expect(page).toHaveURL(/\/inbox/, { timeout: 20000 });
  await expect(page.getByText("Koda Brief", { exact: true })).toBeVisible();
  await expect(page.getByText("3 moves")).toBeVisible();

  // 7. Persistence checks in the database.
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === email);
  expect(user).toBeTruthy();

  const { data: profile } = await db.from("profiles").select("*").eq("user_id", user!.id).single();
  expect(profile.name).toBe("Jordan");
  expect(profile.target_companies).toContain("Figma"); // review edit persisted
  expect(profile.brief_frequency).toBe("weekly");
  expect(profile.autonomous_enabled).toBe(true);
  expect(profile.success_definition).toContain("internship offer");

  const { data: conv } = await db
    .from("koda_conversations")
    .select("status")
    .eq("user_id", user!.id)
    .eq("kind", "onboarding")
    .single();
  expect(conv?.status).toBe("completed");

  const { data: brief } = await db
    .from("briefs")
    .select("*")
    .eq("user_id", user!.id)
    .eq("source", "onboarding")
    .single();
  expect(brief).toBeTruthy();

  const { data: moves } = await db
    .from("recruiting_moves")
    .select("*")
    .eq("user_id", user!.id)
    .eq("brief_id", brief.id);
  expect(moves).toHaveLength(3);
  const types = new Set(moves!.map((m) => m.type));
  expect(types.size).toBe(3); // meaningfully different move types
  for (const move of moves!) {
    expect(move.source_status).toMatch(/^(user_provided|inferred|ai_suggested)$/);
    expect(move.title.length).toBeGreaterThan(0);
  }

  // 8. Survives reload.
  await page.reload();
  await expect(page.getByText("Koda Brief", { exact: true })).toBeVisible();

  // 9. Onboarded users do not see onboarding again.
  await page.goto("/talk");
  await expect(page).toHaveURL(/\/inbox/);
});
