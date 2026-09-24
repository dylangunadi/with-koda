import { test, expect } from "@playwright/test";
import { adminClient, seedOnboardedUser, uniqueEmail } from "./helpers/db";
import { loginViaUi } from "./helpers/auth";

test("waitlist signups are rate limited per client IP", async ({ request }) => {
  // A fresh documentation-range IP per run so reruns start from zero.
  const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}-${Date.now()}`;
  const signup = (email: string) =>
    request.post("/api/waitlist", { headers: { "x-forwarded-for": ip }, data: { email } });

  const emails = Array.from({ length: 5 }, () => uniqueEmail("waitlist"));
  for (const email of emails) {
    const res = await signup(email);
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("created");
  }
  const blocked = await signup(uniqueEmail("waitlist"));
  expect(blocked.status()).toBe(429);

  // Only the allowed signups were stored.
  const { count } = await adminClient()
    .from("waitlist")
    .select("id", { count: "exact", head: true })
    .in("email", emails);
  expect(count).toBe(5);
});

test("waitlist rejects invalid input with a generic message", async ({ request }) => {
  const res = await request.post("/api/waitlist", {
    headers: { "x-forwarded-for": `198.51.100.${Date.now()}` },
    data: { email: "not-an-email" },
  });
  expect(res.status()).toBe(400);
  expect(await res.json()).toEqual({ error: "Enter a valid email" });
});

test("brief confirmation emails are rate limited per address and per user", async ({ page }) => {
  const a = await seedOnboardedUser("confirmlimita");
  const b = await seedOnboardedUser("confirmlimitb");
  const target = uniqueEmail("digest");
  const enable = (email: string) =>
    page.request.post("/api/briefs", { data: { enabled: true, frequency: "daily", email } });

  // Per address: 3 per day, across users. Without RESEND_API_KEY the send
  // itself reports 502, which still counts as an attempt.
  await loginViaUi(page, a.user.email);
  for (let i = 0; i < 3; i++) {
    expect((await enable(target)).status()).not.toBe(429);
  }
  await page.context().clearCookies();
  await loginViaUi(page, b.user.email);
  const addressBlocked = await enable(target);
  expect(addressBlocked.status()).toBe(429);

  // A refused request leaves the profile untouched.
  const { data: profile } = await adminClient()
    .from("profiles")
    .select("pending_brief_email,autonomous_enabled")
    .eq("user_id", b.user.id)
    .single();
  expect(profile!.pending_brief_email).toBeNull();
  expect(profile!.autonomous_enabled).toBe(false);

  // Per user: 5 per hour, across addresses. User b has used 1.
  for (let i = 0; i < 4; i++) {
    expect((await enable(uniqueEmail("digest"))).status()).not.toBe(429);
  }
  expect((await enable(uniqueEmail("digest"))).status()).toBe(429);
});
