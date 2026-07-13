import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { verifySignedValue } from "@/lib/koda/integrations/crypto";
import {
  exchangeCode,
  fetchAccountEmail,
  hasRequiredScopes,
  scopesForService,
  type GoogleService,
} from "@/lib/koda/integrations/google/oauth";
import { isIntegrationsMockMode } from "@/lib/koda/integrations/registry";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { saveTokens } from "@/lib/koda/integrations/tokens";
import { DEFAULT_GMAIL_QUERY, runIntegrationSync } from "@/lib/koda/integrations/sync";
import { logKodaEvent } from "@/lib/koda/events";
import type { Integration } from "@/lib/types";

/**
 * Google OAuth callback. The user returns in the same browser session, so
 * the Supabase cookie client identifies them. Verifies the signed state
 * cookie, handles user cancellation without writing anything, exchanges the
 * code (PKCE), verifies granted scopes (users can uncheck boxes), stores
 * encrypted tokens via the service role, and kicks an inline initial sync.
 */

function settingsRedirect(origin: string, result: string): NextResponse {
  const response = NextResponse.redirect(
    new URL(`/settings/integrations?connect=${result}`, origin)
  );
  // One-shot cookies: always cleared, success or failure. The path must
  // match the one they were set with or the delete is a browser no-op.
  const path = "/api/integrations/google";
  response.cookies.delete({ name: "koda_oauth_state", path });
  response.cookies.delete({ name: "koda_oauth_verifier", path });
  response.cookies.delete({ name: "koda_oauth_service", path });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const cookieStore = await cookies();
  const serviceCookie = cookieStore.get("koda_oauth_service")?.value;
  const serviceValue = serviceCookie ? verifySignedValue(serviceCookie) : null;
  const service: GoogleService = serviceValue === "gmail" ? "gmail" : "calendar";
  const provider = service === "gmail" ? "gmail" : "google_calendar";

  // User cancelled on the consent screen: calm notice, zero rows written.
  if (url.searchParams.get("error")) {
    logKodaEvent(supabase, user.id, "integration_connect_cancelled", { provider });
    return settingsRedirect(url.origin, "cancelled");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = cookieStore.get("koda_oauth_state")?.value;
  const verifierCookie = cookieStore.get("koda_oauth_verifier")?.value;

  const expectedState = stateCookie ? verifySignedValue(stateCookie) : null;
  const codeVerifier = verifierCookie ? verifySignedValue(verifierCookie) : null;

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier) {
    return settingsRedirect(url.origin, "error");
  }

  const mock = isIntegrationsMockMode();

  let accessToken: string;
  let refreshToken: string | null;
  let expiresIn: number;
  let grantedScope: string;
  let accountLabel: string | null;

  if (mock) {
    accessToken = "mock-access-token";
    refreshToken = "mock-refresh-token";
    expiresIn = 3600;
    grantedScope = scopesForService(service).join(" ");
    accountLabel =
      service === "gmail" ? "student@example.com (offline mode)" : "Sample calendar (offline mode)";
  } else {
    try {
      const tokens = await exchangeCode({ code, codeVerifier });
      accessToken = tokens.access_token;
      refreshToken = tokens.refresh_token;
      expiresIn = tokens.expires_in;
      grantedScope = tokens.scope;
    } catch (err) {
      console.error("[integrations] Google code exchange failed:", err);
      return settingsRedirect(url.origin, "error");
    }

    if (!hasRequiredScopes(grantedScope, service)) {
      return settingsRedirect(url.origin, "scope_missing");
    }
    accountLabel = await fetchAccountEmail(accessToken);
  }

  // Upsert the integration through the user client: RLS proves the row
  // belongs to this session's user.
  const { data: integrationRow, error: upsertError } = await supabase
    .from("integrations")
    .upsert(
      {
        user_id: user.id,
        provider,
        status: "connected",
        account_label: accountLabel,
        scopes: grantedScope.split(/\s+/).filter(Boolean),
        // Gmail import is scoped to a recruiting search query, stored where
        // the user can see and tighten it. Never the whole mailbox.
        ...(provider === "gmail" ? { config: { queries: [DEFAULT_GMAIL_QUERY] } } : {}),
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    )
    .select()
    .single();

  if (upsertError || !integrationRow) {
    console.error("[integrations] integration upsert failed:", upsertError?.message);
    return settingsRedirect(url.origin, "error");
  }

  const serviceClient = createServiceClient();
  try {
    await saveTokens(serviceClient, {
      integrationId: integrationRow.id,
      userId: user.id,
      accessToken,
      refreshToken,
      expiresInSeconds: expiresIn,
    });
  } catch (err) {
    console.error("[integrations] token store failed:", err);
    // Without tokens the connection is unusable: remove the shell row.
    await supabase.from("integrations").delete().eq("id", integrationRow.id);
    return settingsRedirect(url.origin, "error");
  }

  logKodaEvent(supabase, user.id, "integration_connected", { provider });

  // Inline initial sync so the settings page shows data immediately. Failure
  // here is non-fatal: nightly cron and "Sync now" both retry.
  const initialSync = await runIntegrationSync(
    serviceClient,
    integrationRow as Integration,
    "initial"
  );
  if (!initialSync.ok) {
    console.warn("[integrations] initial sync failed:", initialSync.error);
  }

  return settingsRedirect(url.origin, "ok");
}
