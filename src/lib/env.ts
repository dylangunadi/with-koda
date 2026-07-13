export function getAnthropicApiKey(): string | null {
  return process.env.ANTHROPIC_API_KEY ?? null;
}

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
}

export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function getResendApiKey(): string | null {
  return process.env.RESEND_API_KEY ?? null;
}

export function getCronSecret(): string | null {
  return process.env.CRON_SECRET ?? null;
}

export function getGoogleClientId(): string | null {
  return process.env.GOOGLE_CLIENT_ID ?? null;
}

export function getGoogleClientSecret(): string | null {
  return process.env.GOOGLE_CLIENT_SECRET ?? null;
}

/** 32-byte base64 key for AES-256-GCM token encryption and OAuth cookie
 * signing. Rotating it invalidates stored tokens (users reconnect). */
export function getTokenEncKey(): string | null {
  return process.env.KODA_TOKEN_ENC_KEY ?? null;
}
