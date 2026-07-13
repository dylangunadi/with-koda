import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { testEnv } from "./env";

let admin: SupabaseClient | null = null;

/** Service-role client for seeding and assertions. Local test stack only. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const env = testEnv();
    const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const host = url ? new URL(url).hostname : "";
    const isLocal = host === "127.0.0.1" || host === "localhost";
    if (!isLocal && process.env.KODA_ALLOW_REMOTE_TEST_DB !== "1") {
      throw new Error(
        `Refusing to run service-role test helpers against non-local Supabase (${host}). ` +
          "Tests seed and delete data. Set KODA_ALLOW_REMOTE_TEST_DB=1 only for a dedicated test project."
      );
    }
    admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return admin;
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export const TEST_PASSWORD = "koda-test-pass-123";

/** Create a confirmed auth user directly (fast path for specs that do not test signup). */
export async function createTestUser(prefix: string): Promise<{ id: string; email: string }> {
  const email = uniqueEmail(prefix);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createTestUser failed: ${error?.message}`);
  return { id: data.user.id, email };
}

/**
 * Seed a fully onboarded user: profile + one onboarding brief with three moves.
 * Frequency defaults to manual so scheduled-brief tests never touch these users.
 */
export async function seedOnboardedUser(prefix: string) {
  const user = await createTestUser(prefix);
  const db = adminClient();

  const { error: profileError } = await db.from("profiles").insert({
    user_id: user.id,
    name: "Seeded Tester",
    school: "UC Berkeley",
    year: "Junior",
    target_roles: ["Product management"],
    target_companies: ["Notion", "Linear"],
    locations: ["San Francisco"],
    recruiting_stage: "actively applying",
    timeline: "internship by November",
    contacts_notes: "Knows a PM named Sam at Notion via consulting club",
    proof_points: "Built a course planner app with 2k users",
    success_definition: "Signed summer internship offer",
    brief_frequency: "manual",
    autonomous_enabled: false,
  });
  if (profileError) throw new Error(`seed profile failed: ${profileError.message}`);

  const { data: brief, error: briefError } = await db
    .from("briefs")
    .insert({ user_id: user.id, source: "onboarding" })
    .select()
    .single();
  if (briefError || !brief) throw new Error(`seed brief failed: ${briefError?.message}`);

  const titles = [
    "Reconnect with Sam at Notion",
    "Turn the course planner into a PM artifact",
    "Set your application plan for November",
  ];
  const types = ["person_to_contact", "proof_of_work", "application_strategy"];
  // Backdated so seeded data never trips the generation rate limit. Each move
  // gets a distinct timestamp and confidence: identical values make DB order
  // and "highest-confidence move" picks nondeterministic (flaky assertions).
  const { data: moves, error: movesError } = await db
    .from("recruiting_moves")
    .insert(
      titles.map((title, i) => ({
        created_at: new Date(Date.now() - 10 * 60 * 1000 - i * 60 * 1000).toISOString(),
        user_id: user.id,
        brief_id: brief.id,
        title,
        type: types[i],
        company: i === 0 ? "Notion" : null,
        fit_reason: "Seeded for tests",
        suggested_action: "Seeded action",
        outreach_draft: i === 0 ? "Hi Sam, it has been a while." : "",
        follow_up_timing: "within 3 days",
        confidence: 0.75 - i * 0.05,
        status: "generated",
        priority: "now",
        effort: "30 min",
        effort_bucket: "focused",
        expected_outcome: "Seeded outcome",
        source_status: "user_provided",
      }))
    )
    .select();
  if (movesError || !moves) throw new Error(`seed moves failed: ${movesError?.message}`);

  return { user, brief, moves };
}
