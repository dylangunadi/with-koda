import "server-only";
import { getAppUrl, getGoogleClientId, getGoogleClientSecret } from "@/lib/env";

/**
 * Plain-fetch Google OAuth helpers (no SDK). Scopes are deliberately
 * minimal: identity (for the account label) plus read-only calendar.
 * Koda never requests write scopes.
 */

export const GOOGLE_CALENDAR_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// gmail.readonly imports thread metadata; gmail.compose covers draft
// creation AND the explicit per-move send. gmail.modify is deliberately not
// requested: compose is the narrowest grant that covers both writes.
export const GMAIL_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

export type GoogleService = "calendar" | "gmail";

export function scopesForService(service: GoogleService): string[] {
  return service === "gmail" ? GMAIL_SCOPES : GOOGLE_CALENDAR_SCOPES;
}

/** The scope each service cannot function without (users can uncheck boxes;
 * gmail.compose is optional — without it, draft creation is simply hidden). */
const REQUIRED_SCOPE: Record<GoogleService, string> = {
  calendar: "https://www.googleapis.com/auth/calendar.readonly",
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
};

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function getRedirectUri(): string {
  return `${getAppUrl()}/api/integrations/google/callback`;
}

export function buildAuthUrl(input: {
  state: string;
  codeChallenge: string;
  service: GoogleService;
}): string {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not set");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: scopesForService(input.service).join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
  scope: string;
}

export async function exchangeCode(input: {
  code: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) throw new Error("Google OAuth is not configured");

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!res.ok) {
    throw new Error(`Google code exchange failed (${res.status})`);
  }
  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : 3600,
    scope: typeof data.scope === "string" ? data.scope : "",
  };
}

/** Result of a refresh attempt. invalid_grant means the user must reconnect
 * (revoked consent, or Testing-mode 7-day refresh token expiry). */
export type RefreshResult =
  | { ok: true; access_token: string; expires_in: number }
  | { ok: false; reason: "invalid_grant" | "transient"; detail: string };

export async function refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "transient", detail: "Google OAuth is not configured" };
  }

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (res.ok) {
    const data = await res.json();
    return {
      ok: true,
      access_token: data.access_token,
      expires_in: typeof data.expires_in === "number" ? data.expires_in : 3600,
    };
  }

  let detail = `status ${res.status}`;
  try {
    const body = await res.json();
    if (typeof body.error === "string") detail = body.error;
  } catch {
    // non-JSON error body; keep the status detail
  }
  return {
    ok: false,
    reason: detail === "invalid_grant" ? "invalid_grant" : "transient",
    detail,
  };
}

/** Best-effort revoke on disconnect; failure never blocks local deletion. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: "POST" });
  } catch {
    // Network failure is fine: the row deletion is the deletion promise.
  }
}

export async function fetchAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

/** True when the service's required scope was actually granted (users can
 * uncheck boxes on the consent screen). */
export function hasRequiredScopes(grantedScope: string, service: GoogleService): boolean {
  const granted = new Set(grantedScope.split(/\s+/).filter(Boolean));
  return granted.has(REQUIRED_SCOPE[service]);
}

export function hasComposeScope(scopes: string[]): boolean {
  return scopes.includes("https://www.googleapis.com/auth/gmail.compose");
}
