import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { IntegrationCard } from "@/components/integrations/IntegrationCard";
import { JobBoardsManager } from "@/components/integrations/JobBoardsManager";
import type { Integration, IntegrationSyncRun } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Integration management: connection status, plain-language scope
 * disclosure, sync, and disconnect-with-deletion. Trust copy states exactly
 * what Koda reads and what it will never do automatically.
 */
export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connect?: string }>;
}) {
  const { connect } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: integrationRows }, { data: profileRow }] = await Promise.all([
    supabase.from("integrations").select("*").eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("target_companies")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const integrations = (integrationRows ?? []) as Integration[];
  const calendar = integrations.find((i) => i.provider === "google_calendar") ?? null;
  const gmail = integrations.find((i) => i.provider === "gmail") ?? null;
  const jobBoards = integrations.find((i) => i.provider === "job_boards") ?? null;

  async function lastRun(integration: Integration | null): Promise<IntegrationSyncRun | null> {
    if (!integration) return null;
    const { data: runRows } = await supabase
      .from("integration_sync_runs")
      .select("*")
      .eq("integration_id", integration.id)
      .order("started_at", { ascending: false })
      .limit(1);
    return (runRows?.[0] as IntegrationSyncRun) ?? null;
  }

  const [lastCalendarRun, lastGmailRun] = await Promise.all([
    lastRun(calendar),
    lastRun(gmail),
  ]);

  return (
    <div className="page-enter">
      <div className="mb-10">
        <p className="font-system text-primary mb-2">Integrations</p>
        <h1 className="text-2xl font-heading font-bold tracking-tight text-foreground">
          Connected sources
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Koda reads these sources to ground your briefs in real events and real
          openings. Koda never sends email, never creates or changes calendar
          events, and never contacts anyone. Disconnecting deletes everything
          Koda imported.
        </p>
        <p className="text-sm mt-2">
          <Link href="/settings" className="text-primary underline underline-offset-2 hover:text-foreground">
            ← Profile settings
          </Link>
        </p>
      </div>

      {connect === "ok" && (
        <NoticeCard tone="ok" text="Connected. Koda pulled your data and will keep it fresh." />
      )}
      {connect === "cancelled" && (
        <NoticeCard tone="muted" text="No problem. Nothing was connected and nothing was saved." />
      )}
      {connect === "scope_missing" && (
        <NoticeCard
          tone="error"
          text="The needed access was not granted, so Koda could not connect. Reconnect and allow the read access shown on the consent screen."
        />
      )}
      {connect === "error" && (
        <NoticeCard tone="error" text="Something went wrong connecting to Google. Try again." />
      )}

      <div className="space-y-8">
        <IntegrationCard provider="google_calendar" integration={calendar} lastRun={lastCalendarRun} />
        <IntegrationCard provider="gmail" integration={gmail} lastRun={lastGmailRun} />
        <JobBoardsManager
          integration={jobBoards}
          targetCompanies={profileRow?.target_companies ?? []}
        />
      </div>
    </div>
  );
}

function NoticeCard({ tone, text }: { tone: "ok" | "muted" | "error"; text: string }) {
  const toneClass =
    tone === "ok"
      ? "border-teal-600/40 text-teal-800 dark:text-teal-300"
      : tone === "error"
        ? "border-red-600/40 text-red-700 dark:text-red-400"
        : "border-border text-muted-foreground";
  return (
    <div className={`mb-6 rounded-xl border bg-card shadow-sm px-4 py-3 text-sm ${toneClass}`}>
      {text}
    </div>
  );
}
