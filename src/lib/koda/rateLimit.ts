import { createHmac } from "crypto";
import { getRateLimitSecret } from "@/lib/env";

/**
 * Keyed hash for rate-limit keys, so stored counters never hold a raw or
 * reversible IP address or email (plain MD5/SHA-256 of either can be undone
 * by enumeration). Returns null when RATE_LIMIT_SECRET is not configured;
 * callers must fail closed (503) rather than fall back to another key.
 */
export function rateLimitHash(value: string): string | null {
  const secret = getRateLimitSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(value).digest("hex");
}
