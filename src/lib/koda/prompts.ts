import type { Profile, AgentContext } from "@/lib/types";
import type { OnboardingTurnInput } from "@/lib/koda/ai/provider";
import { ONBOARDING_FIELDS } from "@/lib/koda/onboarding";

export const ONBOARDING_TURN_SYSTEM_PROMPT = `You are Koda, a calm and useful recruiting agent for students. You are running the student's first onboarding conversation. Your goals each turn: extract structured facts from what the student just said, then ask the single most useful next question.

RULES — follow exactly:
1. Never ask about a field that already has a value in KNOWN FIELDS. Do not make the student repeat themselves.
2. Extract only facts the student actually stated. Never invent, embellish, or assume values.
3. Ask exactly one question per turn, aimed at the first field in STILL MISSING.
4. Keep replies short: one brief acknowledgment sentence referencing what they said, then the question. No pep talks, no filler.
5. If STILL MISSING will be empty after this extraction, do not ask another question. Tell the student you have what you need and that they should review what you learned and confirm.
6. Plain language. No em dashes. No corporate speak.
7. Return ONLY a JSON object, no markdown fences, no preamble, no explanation of your reasoning. The JSON is your entire output.

Output shape:
{"reply": "<what you say to the student>", "extracted": {<only fields the student just provided>}}

extracted may contain: name, school, year (strings); target_roles, target_companies, locations (arrays of strings); recruiting_stage, timeline, work_auth, contacts, proof_points, success_definition (strings). Omit fields the student did not just provide.`;

export function buildOnboardingTurnPrompt(input: OnboardingTurnInput): string {
  const parts: string[] = [];
  parts.push("KNOWN FIELDS (do not ask about these again):");
  parts.push(JSON.stringify(input.extracted));
  parts.push("\nSTILL MISSING (in priority order):");
  parts.push(
    input.missing
      .map((k) => {
        const q = ONBOARDING_FIELDS.find((f) => f.key === k)?.question;
        return `- ${k}${q ? ` (suggested angle: ${q})` : ""}`;
      })
      .join("\n") || "(nothing)"
  );
  if (input.history.length) {
    parts.push("\nRECENT CONVERSATION:");
    for (const m of input.history.slice(-8)) {
      parts.push(`${m.role === "user" ? "Student" : "Koda"}: ${m.content}`);
    }
  }
  parts.push(`\nStudent's new message: ${input.userMessage}`);
  parts.push("\nReturn the JSON object now.");
  return parts.join("\n");
}

export const MOVE_GENERATOR_SYSTEM_PROMPT = `You are Koda, a recruiting strategist for undergrad students breaking into competitive careers. Your job is to generate specific, actionable recruiting moves that a student can execute this week.

RULES — follow these exactly:

1. Generate exactly 3 moves. Each move must be a different type from: opportunity, person_to_contact, follow_up, proof_of_work, application_strategy.
2. Every move must be specific to the student's profile, target roles, and target companies. Generic advice is forbidden.
3. NEVER fabricate specific real people by name. Instead use archetypes like "a PM at a Series B fintech startup" or "an engineering manager at [target company]". The person field should describe a type of person, not a named individual.
4. Outreach drafts must be warm, concise, and human. No corporate language, no em-dashes, no bracket placeholders. Hard banned phrases: circling back, touching base, bandwidth, per my last, I hope this finds you well, value-add, leverage, impactful.
5. Proof-of-work ideas must be completable in 1-3 hours and produce a tangible artifact (a memo, a prototype, an analysis, a write-up).
6. Confidence scores reflect how well the move fits the student's stated goals: 0.9+ for direct target company/role matches, 0.7-0.9 for adjacent fits, 0.5-0.7 for exploratory moves.
7. fit_reason should explain WHY this move matters for this specific student, not just what it is.
8. suggested_action should be a single concrete next step the student can take today.
9. follow_up_timing should be a specific timeframe like "within 3 days" or "next Monday", not vague.

Return strict JSON only — no markdown, no explanation, no code fences. The response must be a JSON array of exactly 3 objects.

Each object must have these exact keys:
- title: string (short, action-oriented)
- type: one of "opportunity" | "person_to_contact" | "follow_up" | "proof_of_work" | "application_strategy"
- company: string or null
- person: string or null (archetype description, never a real name)
- fit_reason: string
- suggested_action: string
- outreach_draft: string (ready-to-send message, or empty string if not applicable)
- proof_of_work_idea: string (or empty string if not applicable)
- follow_up_timing: string
- source_note: string (brief note explaining why Koda chose this move based on the student's history and feedback patterns, e.g. "You accepted similar proof-of-work moves before" or "New move type to diversify your strategy")
- confidence: number between 0 and 1
- priority: one of "now" | "this_week" | "soon"
- effort: realistic time estimate like "30 min" or "1-2 hours"
- expected_outcome: string (what completing this move actually gets the student)
- source_status: one of "user_provided" (built directly from facts the student stated), "inferred" (a reasonable conclusion from their profile), "ai_suggested" (your idea, not grounded in a specific stated fact)

GROUNDING: Use only facts from the student's profile and agent memory below. If a move rests on something the student did not state, its source_status must be "ai_suggested". Never present an invented opening, event, or person as if it were verified.`;

export function buildUserPrompt(
  profile: Profile,
  agentContext?: AgentContext
): string {
  const parts: string[] = [];

  parts.push(`Student: ${profile.name || "Unknown"}`);
  if (profile.school) parts.push(`School: ${profile.school}`);
  if (profile.year) parts.push(`Year: ${profile.year}`);

  const targetRoles = profile.target_roles ?? [];
  if (targetRoles.length > 0) {
    parts.push(`Target roles: ${targetRoles.join(", ")}`);
  }
  const targetCompanies = profile.target_companies ?? [];
  if (targetCompanies.length > 0) {
    parts.push(`Target companies: ${targetCompanies.join(", ")}`);
  }
  const industries = profile.industries ?? [];
  if (industries.length > 0) {
    parts.push(`Industries: ${industries.join(", ")}`);
  }
  const locations = profile.locations ?? [];
  if (locations.length > 0) {
    parts.push(`Preferred locations: ${locations.join(", ")}`);
  }
  if (profile.work_auth) {
    parts.push(`Work authorization: ${profile.work_auth}`);
  }
  if (profile.linkedin_url) {
    parts.push(`LinkedIn: ${profile.linkedin_url}`);
  }
  if (profile.resume_text) {
    parts.push(`\nResume:\n${profile.resume_text}`);
  }
  const focusOptions = profile.focus_options ?? [];
  if (focusOptions.length > 0) {
    parts.push(`\nFocus areas: ${focusOptions.join(", ")}`);
  }
  if (profile.semester_goal) {
    parts.push(`\nSemester goal: ${profile.semester_goal}`);
  }
  if (profile.recruiting_stage) {
    parts.push(`Recruiting stage: ${profile.recruiting_stage}`);
  }
  if (profile.timeline) {
    parts.push(`Timing and deadlines: ${profile.timeline}`);
  }
  if (profile.proof_points) {
    parts.push(`Projects and proof of work: ${profile.proof_points}`);
  }
  if (profile.contacts_notes) {
    parts.push(`Existing contacts (stated by the student, usable by name): ${profile.contacts_notes}`);
  }
  if (profile.success_definition) {
    parts.push(`Their definition of success: ${profile.success_definition}`);
  }

  // Inject agent memory / feedback context
  const hasInteraction = agentContext?.prior_moves.some((m) => m.status !== "generated");
  if (agentContext && agentContext.prior_moves.length > 0 && hasInteraction) {
    parts.push("\n--- AGENT MEMORY (learn from this) ---");

    const fb = agentContext.feedback;
    parts.push(
      `History: ${fb.total_accepted} accepted, ${fb.total_rejected} rejected, ${fb.total_sent} sent, ${fb.total_saved} saved, ${fb.edited_drafts_count} drafts edited.`
    );

    if (fb.boost_types.length > 0) {
      parts.push(
        `Student tends to ACCEPT these move types: ${fb.boost_types.join(", ")}. Generate more of these.`
      );
    }
    if (fb.reduce_types.length > 0) {
      parts.push(
        `Student tends to REJECT these move types: ${fb.reduce_types.join(", ")}. Avoid or improve these.`
      );
    }
    if (fb.boost_companies.length > 0) {
      parts.push(
        `Student engages with these companies: ${fb.boost_companies.join(", ")}. Prioritize moves related to them.`
      );
    }
    if (fb.reduce_companies.length > 0) {
      parts.push(
        `Student rejects moves about these companies: ${fb.reduce_companies.join(", ")}. Avoid them unless there's a strong new reason.`
      );
    }
    for (const signal of fb.tone_signals) {
      parts.push(`Tone note: ${signal}`);
    }

    // Show recent accepted/sent moves to avoid duplicates
    const recentGood = agentContext.prior_moves
      .filter((m) => m.status === "accepted" || m.status === "sent")
      .slice(0, 5);
    if (recentGood.length > 0) {
      parts.push("\nRecent moves the student liked (do NOT repeat these, build on them):");
      for (const m of recentGood) {
        parts.push(`- [${m.type}] ${m.title}${m.company ? ` (${m.company})` : ""}`);
      }
    }

    // Show recent rejected to avoid similar
    const recentBad = agentContext.prior_moves
      .filter((m) => m.status === "rejected")
      .slice(0, 5);
    if (recentBad.length > 0) {
      parts.push("\nRecent moves the student rejected (avoid similar moves):");
      for (const m of recentBad) {
        parts.push(`- [${m.type}] ${m.title}${m.company ? ` (${m.company})` : ""}`);
      }
    }

    parts.push("--- END AGENT MEMORY ---");
  }

  parts.push(
    "\nGenerate 3 recruiting moves tailored to this student. Return a JSON array of 3 objects."
  );

  return parts.join("\n");
}
