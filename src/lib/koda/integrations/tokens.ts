import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./crypto";
import { refreshAccessToken } from "./google/oauth";
import { ReconnectRequiredError } from "./types";
import { isIntegrationsMockMode } from "./registry";

/**
 * The ONLY module that reads or writes integration_tokens. Callers receive a
 * short-lived access token, never the stored/refresh material. All clients
 * passed in must be service-role (the table has no RLS policies).
 * Tokens are never logged.
 */

const REFRESH_SKEW_MS = 120_000;

export async function saveTokens(
  service: SupabaseClient,
  input: {
    integrationId: string;
    userId: string;
    accessToken: string;
    refreshToken: string | null;
    expiresInSeconds: number;
  }
): Promise<void> {
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000).toISOString();
  const row: Record<string, unknown> = {
    integration_id: input.integrationId,
    user_id: input.userId,
    access_token_enc: encryptSecret(input.accessToken),
    access_token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };
  // Google only returns a refresh token on first consent; keep the stored one
  // when a later exchange omits it.
  if (input.refreshToken) {
    row.refresh_token_enc = encryptSecret(input.refreshToken);
  }
  const { error } = await service
    .from("integration_tokens")
    .upsert(row, { onConflict: "integration_id" });
  if (error) {
    throw new Error(`Failed to store tokens: ${error.message}`);
  }
}

/** Decrypt the stored refresh token (used only for revocation on disconnect). */
export async function readRefreshToken(
  service: SupabaseClient,
  integrationId: string
): Promise<string | null> {
  const { data } = await service
    .from("integration_tokens")
    .select("refresh_token_enc")
    .eq("integration_id", integrationId)
    .maybeSingle();
  if (!data?.refresh_token_enc) return null;
  try {
    return decryptSecret(data.refresh_token_enc);
  } catch {
    return null;
  }
}

/**
 * Return a currently-valid access token for an integration, refreshing (and
 * persisting the rotation) when it is expired or about to expire. Throws
 * ReconnectRequiredError after marking the integration as needing reconnect
 * when the refresh grant is dead.
 */
export async function getValidAccessToken(
  service: SupabaseClient,
  integrationId: string
): Promise<string> {
  if (isIntegrationsMockMode()) {
    return "mock-access-token";
  }

  const { data: row, error } = await service
    .from("integration_tokens")
    .select("access_token_enc, refresh_token_enc, access_token_expires_at, user_id")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error || !row) {
    await markNeedsReconnect(service, integrationId);
    throw new ReconnectRequiredError("missing_tokens");
  }

  const expiresAt = row.access_token_expires_at
    ? new Date(row.access_token_expires_at).getTime()
    : 0;

  if (row.access_token_enc && expiresAt - Date.now() > REFRESH_SKEW_MS) {
    try {
      return decryptSecret(row.access_token_enc);
    } catch {
      // Fall through to refresh: an undecryptable token (e.g. key rotation)
      // is treated like an expired one.
    }
  }

  if (!row.refresh_token_enc) {
    await markNeedsReconnect(service, integrationId);
    throw new ReconnectRequiredError("missing_refresh_token");
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(row.refresh_token_enc);
  } catch {
    await markNeedsReconnect(service, integrationId);
    throw new ReconnectRequiredError("undecryptable_refresh_token");
  }

  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed.ok) {
    if (refreshed.reason === "invalid_grant") {
      await markNeedsReconnect(service, integrationId);
      throw new ReconnectRequiredError("invalid_grant");
    }
    throw new Error(`Token refresh failed: ${refreshed.detail}`);
  }

  await saveTokens(service, {
    integrationId,
    userId: row.user_id,
    accessToken: refreshed.access_token,
    refreshToken: null,
    expiresInSeconds: refreshed.expires_in,
  });

  return refreshed.access_token;
}

export async function markNeedsReconnect(
  service: SupabaseClient,
  integrationId: string
): Promise<void> {
  await service
    .from("integrations")
    .update({
      status: "error",
      last_sync_error: "reconnect_required",
      updated_at: new Date().toISOString(),
    })
    .eq("id", integrationId);
}
