import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getTokenEncKey } from "@/lib/env";

/**
 * AES-256-GCM encryption for OAuth tokens at rest, keyed by
 * KODA_TOKEN_ENC_KEY (32 bytes, base64). Ciphertext format is
 * base64(iv).base64(ct).base64(tag). Rotating the key invalidates stored
 * tokens; users reconnect their integrations.
 */

const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = getTokenEncKey();
  if (!raw) {
    throw new Error("KODA_TOKEN_ENC_KEY is not set");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("KODA_TOKEN_ENC_KEY must be 32 bytes of base64");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${ct.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret");
  }
  const [iv, ct, tag] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Sign a short-lived value (OAuth state / PKCE cookies) with a key derived
 * from the encryption key, so tampered cookies are rejected. */
export function signValue(value: string): string {
  return `${value}.${hmac(value)}`;
}

export function verifySignedValue(signed: string): string | null {
  const at = signed.lastIndexOf(".");
  if (at <= 0) return null;
  const value = signed.slice(0, at);
  const mac = signed.slice(at + 1);
  const expected = hmac(value);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return value;
}

function hmac(value: string): string {
  return createHmac("sha256", loadKey())
    .update(`koda-oauth-cookie:${value}`)
    .digest("base64url");
}
