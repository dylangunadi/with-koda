import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser, uniqueEmail } from "./helpers/db";
import { loginViaUi, signupViaUi } from "./helpers/auth";

const ANSWERS = [
  "I'm Dana, a junior at UC Berkeley",
  "Product management",
  "Notion and Linear",
  "Just starting",
  "Internship by November",
  "SF, US citizen",
  "None yet",
  "Built a budgeting app for students",
  "A signed internship offer",
];

test("AI failure preserves the user's input and permits retry", async ({ page, context }) => {
  await signupViaUi(page, uniqueEmail("aifail"));

  // Force the provider to fail (honored only in mock mode outside production).
  await context.setExtraHTTPHeaders({ "x-koda-test-ai": "fail" });
  const message = "I'm Sam, a sophomore at Cal";
  await page.getByLabel("Message Koda").fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  // Error banner with retry; the composer still holds the message; the
  // transcript shows no phantom turn. (Filter excludes Next's empty route
  // announcer, which also has role=alert.)
  const banner = page.getByRole("alert").filter({ hasText: /./ });
  await expect(banner).toContainText(/could not process|try again/i);
  await expect(page.getByLabel("Message Koda")).toHaveValue(message);
  await expect(page.getByText("0 of 9 covered")).toBeVisible();

  // Recover and retry: the same input goes through.
  await context.setExtraHTTPHeaders({});
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });

  // A failed turn is also never persisted: reload shows the same progress.
  await page.reload();
  await expect(page.getByText("1 of 9 covered")).toBeVisible();
});

test("duplicate rapid submission does not create a second turn", async ({ page }) => {
  const email = uniqueEmail("dupturn");
  await signupViaUi(page, email);

  await page.getByLabel("Message Koda").fill("I'm Alex at Stanford");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("1 of 9 covered")).toBeVisible({ timeout: 20000 });

  const db = adminClient();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === email);
  const countMessages = async () => {
    const { data } = await db.from("koda_messages").select("id").eq("user_id", user!.id);
    return data?.length ?? 0;
  };

  // Replay the exact same message immediately via the API (page.request
  // shares the session cookies). The route streams; the last data frame is
  // the final payload.
  const second = await page.request.post("/api/talk", {
    data: { message: "I'm Alex at Stanford", inputMode: "text" },
  });
  const before = await countMessages();
  expect(second.ok()).toBeTruthy();
  const finalFrame = (await second.text())
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .pop();
  expect(JSON.parse(finalFrame!.slice(5)).duplicate).toBe(true);
  expect(await countMessages()).toBe(before);
});

test("repeated confirm produces exactly one profile, one brief, three moves", async ({
  page,
}) => {
  const email = uniqueEmail("dupconfirm");
  await signupViaUi(page, email);

  for (let i = 0; i < ANSWERS.length; i++) {
    await page.getByLabel("Message Koda").fill(ANSWERS[i]);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(
      page
        .getByText(`${i + 1} of 9 covered`)
        .or(page.getByRole("heading", { name: "Here is what Koda learned" }))
    ).toBeVisible({ timeout: 20000 });
  }

  const confirm = page.getByRole("button", { name: "Confirm and build my first brief" });
  // Two rapid activations: the client guard and the server-side unique index
  // must both hold.
  await confirm.dispatchEvent("click");
  await confirm.dispatchEvent("click");
  await expect(page).toHaveURL(/\/inbox/, { timeout: 30000 });

  const db = adminClient();
  const { data: users } = await db.auth.admin.listUsers({ perPage: 200 });
  const user = users.users.find((u) => u.email === email);

  const { data: profiles } = await db.from("profiles").select("id").eq("user_id", user!.id);
  expect(profiles).toHaveLength(1);
  const { data: briefs } = await db.from("briefs").select("id").eq("user_id", user!.id);
  expect(briefs).toHaveLength(1);
  const { data: moves } = await db.from("recruiting_moves").select("id").eq("user_id", user!.id);
  expect(moves).toHaveLength(3);
});

test("repeated generation cannot create duplicate briefs back to back", async ({ page }) => {
  const { user } = await seedOnboardedUser("dupgen");
  await loginViaUi(page, user.email);

  const first = await page.request.post("/api/moves/generate");
  expect(first.status()).toBe(200);
  const second = await page.request.post("/api/moves/generate");
  expect(second.status()).toBe(429);

  const db = adminClient();
  const { data: manualBriefs } = await db
    .from("briefs")
    .select("id")
    .eq("user_id", user.id)
    .eq("source", "manual");
  expect(manualBriefs).toHaveLength(1);
});
