import { getGoogleClientId, getGoogleClientSecret } from "@/lib/env";
import type { CalendarSource, OpportunitySource } from "./types";

/**
 * Adapter selection, mirroring the KODA_AI_MOCK pattern in ai/provider.ts.
 *
 * Calendar uses the mock adapter when KODA_INTEGRATIONS_MOCK=1 or Google
 * OAuth credentials are missing. Job boards need no credentials, so they
 * mock only on the explicit flag.
 */
export function isIntegrationsMockMode(): boolean {
  return (
    process.env.KODA_INTEGRATIONS_MOCK === "1" ||
    !getGoogleClientId() ||
    !getGoogleClientSecret()
  );
}

export function isJobBoardsMockMode(): boolean {
  return process.env.KODA_INTEGRATIONS_MOCK === "1";
}

/**
 * Test-only failure injection for integration flows: honored exclusively in
 * mock mode outside production. Can only cause failures, never fake success.
 */
export function isForcedIntegrationFailure(headers: Headers): boolean {
  return (
    process.env.KODA_INTEGRATIONS_MOCK === "1" &&
    process.env.NODE_ENV !== "production" &&
    headers.get("x-koda-test-integration") === "fail"
  );
}

export async function getCalendarSource(): Promise<CalendarSource> {
  if (isIntegrationsMockMode()) {
    const { mockCalendarSource } = await import("./mock/calendar");
    return mockCalendarSource;
  }
  const { googleCalendarSource } = await import("./google/calendar");
  return googleCalendarSource;
}

export async function getOpportunitySource(ats: "greenhouse" | "lever"): Promise<OpportunitySource> {
  if (isJobBoardsMockMode()) {
    const { mockOpportunitySource } = await import("./mock/jobs");
    return mockOpportunitySource;
  }
  if (ats === "greenhouse") {
    const { greenhouseSource } = await import("./jobs/greenhouse");
    return greenhouseSource;
  }
  const { leverSource } = await import("./jobs/lever");
  return leverSource;
}
