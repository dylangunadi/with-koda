import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { signValue } from "@/lib/koda/integrations/crypto";
import { buildAuthUrl, type GoogleService } from "@/lib/koda/integrations/google/oauth";
import { isIntegrationsMockMode } from "@/lib/koda/integrations/registry";

/**
 * Starts the Google Calendar OAuth flow. Requires a Supabase session. State
 * nonce + PKCE verifier travel in short-lived HMAC-signed httpOnly cookies;
 * the callback rejects any mismatch. In mock mode (tests, keyless dev) the
 * flow short-circuits straight to the callback with code=mock so the entire
 * downstream path is exercised without Google.
 */

const COOKIE_MAX_AGE_SECONDS = 600;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const service: GoogleService =
    url.searchParams.get("service") === "gmail" ? "gmail" : "calendar";

  const state = randomBytes(16).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  const target = isIntegrationsMockMode()
    ? new URL(
        `/api/integrations/google/callback?code=mock&state=${encodeURIComponent(state)}`,
        url.origin
      ).toString()
    : buildAuthUrl({ state, codeChallenge, service });

  const response = NextResponse.redirect(target);
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: url.protocol === "https:",
    path: "/api/integrations/google",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
  response.cookies.set("koda_oauth_state", signValue(state), cookieOptions);
  response.cookies.set("koda_oauth_verifier", signValue(codeVerifier), cookieOptions);
  // Which Google service this flow is for; the callback trusts only this
  // signed cookie, never a query parameter Google echoes back.
  response.cookies.set("koda_oauth_service", signValue(service), cookieOptions);
  return response;
}
