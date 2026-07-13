#!/usr/bin/env node
// Live-provider smoke test: exercises /api/talk and first-brief generation
// against a RUNNING app configured with a real ANTHROPIC_API_KEY.
//
// Usage:
//   1. Ensure .env.local has ANTHROPIC_API_KEY set and KODA_AI_MOCK unset.
//   2. npm run dev (or point APP_URL at a preview deployment).
//   3. node scripts/smoke-live-provider.mjs
//
// Creates one throwaway user. Fails loudly if the app answers from the
// offline provider, so it cannot false-positive without a live model.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APP = process.env.APP_URL ?? "http://localhost:3000";
let env = {};
try {
  env = Object.fromEntries(
    readFileSync(new URL("../.env.local", import.meta.url), "utf8")
      .split("\n").filter(Boolean).map((l) => l.split(/=(.*)/s).slice(0, 2))
  );
} catch { /* rely on process.env (e.g. against a preview) */ }
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const fail = (msg, extra) => {
  console.error(`\nFAIL: ${msg}`);
  if (extra) console.error(extra);
  process.exit(1);
};

if (!SUPABASE_URL || !ANON_KEY) fail("Supabase env not found (.env.local or process env)");

const supabase = createClient(SUPABASE_URL, ANON_KEY);
const email = `live-smoke-${Date.now()}@example.com`;
const { data: signup, error: signupError } = await supabase.auth.signUp({
  email,
  password: "live-smoke-pass-123",
});
if (signupError) fail("signup failed", signupError.message);
if (!signup.session) {
  fail(
    "signup returned no session (email confirmation is on for this Supabase project); " +
      "use a project with confirmations off for smoke testing"
  );
}

const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
const cookie = `sb-${ref}-auth-token=base64-${Buffer.from(
  JSON.stringify(signup.session)
).toString("base64url")}`;

async function turn(message) {
  const started = Date.now();
  const res = await fetch(`${APP}/api/talk`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ message, inputMode: "text" }),
  });
  const elapsed = Date.now() - started;
  if (!res.ok) fail(`/api/talk returned ${res.status}`, await res.text());
  const contentType = res.headers.get("content-type") ?? "";
  // Works with both the JSON and streaming response shapes.
  if (contentType.includes("text/event-stream")) {
    const raw = await res.text();
    const finalLine = raw.split("\n").filter((l) => l.startsWith("data:")).pop();
    return { ...JSON.parse(finalLine.slice(5)), elapsed };
  }
  return { ...(await res.json()), elapsed };
}

console.log(`Smoke user: ${email}`);
const first = await turn("I'm Sasha, a junior at UC Berkeley studying cognitive science");
if (first.aiMode !== "live") {
  fail(
    `app answered with aiMode="${first.aiMode}" — the offline provider is active. ` +
      "Set ANTHROPIC_API_KEY and remove KODA_AI_MOCK, then restart the app."
  );
}
if (!first.extracted?.name) fail("live model extracted no name from the intro turn", first);
console.log(`turn 1 OK (live, ${first.elapsed}ms): extracted ${Object.keys(first.extracted).join(", ")}`);

const second = await turn("I want product management roles, mostly at Notion or Linear");
if (!second.extracted?.target_roles?.length) {
  fail("live model extracted no target_roles", second);
}
console.log(`turn 2 OK (live, ${second.elapsed}ms): roles = ${second.extracted.target_roles.join(", ")}`);
console.log(`fields still missing: ${second.missing.join(", ") || "(none)"}`);

console.log("\nLIVE PROVIDER SMOKE PASSED");
console.log("Full verification: complete onboarding in the browser with this account,");
console.log(`confirm the review screen, and check the brief has no "Offline sample mode" labels.`);
