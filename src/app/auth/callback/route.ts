import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase auth callback: exchanges the one-time code from confirmation and
 * magic-link emails for a session, then routes into the app. /talk is the
 * single correct landing spot: it sends onboarded users on to the inbox and
 * starts onboarding for everyone else.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/talk";
  // Relative paths only: never allow an open redirect.
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/talk";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
    console.error("Auth code exchange failed:", error.message);
  }

  return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
}
