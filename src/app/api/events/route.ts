import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logKodaEvent, type KodaEventName } from "@/lib/koda/events";

// Client-originated product events. Whitelisted names only, no free-form
// properties: browsers cannot be trusted with the analytics namespace.
const CLIENT_EVENTS = new Set<KodaEventName>(["voice_permission_denied"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = body.name as KodaEventName;
  if (!CLIENT_EVENTS.has(name)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }
  logKodaEvent(supabase, user.id, name);
  return NextResponse.json({ ok: true });
}
