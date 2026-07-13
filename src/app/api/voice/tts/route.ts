import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Text-to-speech proxy: turns one reply sentence into natural speech audio.
// The OpenAI key stays server-side; the browser only ever sees audio bytes.
// Spoken text is passed through and never logged or persisted here.

const MAX_TEXT_LENGTH = 1000;
const TTS_MODEL = process.env.KODA_TTS_MODEL ?? "gpt-4o-mini-tts";
const TTS_VOICE = process.env.KODA_TTS_VOICE ?? "coral";
const TTS_INSTRUCTIONS =
  "Warm, natural and conversational, like a helpful mentor on a phone call. Easy pace, no announcer energy.";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: "text must be 1-1000 characters" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // The client falls back to browser voices; this is expected, not an error.
    return NextResponse.json({ error: "TTS not configured", fallback: true }, { status: 501 });
  }

  const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: TTS_MODEL,
      voice: TTS_VOICE,
      input: text,
      instructions: TTS_INSTRUCTIONS,
      response_format: "mp3",
    }),
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    console.error("TTS upstream failed:", upstream?.status);
    return NextResponse.json({ error: "TTS unavailable", fallback: true }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
    },
  });
}
