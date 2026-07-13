"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Calendar, X } from "lucide-react";

/**
 * Post-first-brief integration recommendation: one integration, goal-derived
 * copy, plain trust disclosure, dismissible. Deliberately not shown during
 * onboarding — the recommendation lands after the user has seen value.
 */
export function ConnectPrompt({ recruitingStage }: { recruitingStage: string | null }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  const stage = (recruitingStage ?? "").toLowerCase();
  const reason = stage.includes("interview")
    ? "You said you're interviewing. Connect Google Calendar and Koda preps you before every recruiter call and interview, and reminds you to follow up after."
    : stage.includes("network")
      ? "You said you're networking. Connect Google Calendar and Koda preps you before coffee chats and turns them into follow-ups."
      : "Connect Google Calendar and Koda preps you before coffee chats, recruiter calls, and interviews, and reminds you to follow up after.";

  async function dismiss() {
    setHidden(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("profiles")
        .update({ integrations_prompt_dismissed_at: new Date().toISOString() })
        .eq("user_id", user.id);
      // Supabase builders are lazy: without await the request never fires.
      await supabase.from("koda_events").insert({
        user_id: user.id,
        event_name: "integrations_prompt_dismissed",
        properties: {},
      });
    }
    router.refresh();
  }

  if (hidden) return null;

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm px-5 py-4 flex items-start gap-3">
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Calendar className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Ground your briefs in your real calendar
        </p>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{reason}</p>
        <p className="mt-1 font-system text-muted-foreground">
          Read-only. Koda never sends email or creates events. Disconnect anytime
          and Koda deletes everything it imported.
        </p>
        <div className="mt-3">
          <a
            href="/api/integrations/google/connect"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-[#075B59] transition-colors"
          >
            Connect Google Calendar
          </a>
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss integration suggestion"
        className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
