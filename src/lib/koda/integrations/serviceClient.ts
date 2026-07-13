import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for integration internals. Required for
 * integration_tokens (RLS with no policies — only the service role can read
 * or write tokens) and for cron sync runs.
 */
export function createServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase service config");
  }
  return createClient(supabaseUrl, serviceKey);
}
