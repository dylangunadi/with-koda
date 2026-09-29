import { test, expect } from "@playwright/test";

test("simple landing shows the video and an email-only waitlist form", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your recruiting agent." })).toBeVisible();
  const video = page.getByTestId("landing-video");
  await expect(video).toBeVisible();
  // Browsers only allow autoplay for muted video.
  await expect(video).toHaveJSProperty("autoplay", true);
  await expect(video).toHaveJSProperty("muted", true);
  await expect(video).toHaveJSProperty("loop", true);
  await expect(page.getByLabel("Email *")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
});

test("simple waitlist form posts the email to /api/waitlist", async ({ page }) => {
  let posted: Record<string, unknown> | null = null;
  await page.route("**/api/waitlist", async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({ json: { success: true, status: "created" } });
  });

  await page.goto("/");
  await page.getByLabel("Email *").fill("student@school.edu");
  await page.getByRole("button", { name: "Join the waitlist" }).click();

  await expect(page.getByText("You're on the list.")).toBeVisible();
  expect(posted).toMatchObject({ email: "student@school.edu", source: "website" });
});

test("full landing is still available at /full", async ({ page }) => {
  await page.goto("/full");
  await expect(page.getByLabel("Name")).toBeVisible();
});
