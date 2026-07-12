import type { Profile, AgentContext } from "@/lib/types";

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
- confidence: number between 0 and 1`;

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
  if (profile.company_size) {
    parts.push(`Company size preference: ${profile.company_size}`);
  }
  if (profile.work_auth) {
    parts.push(`Work authorization: ${profile.work_auth}`);
  }
  if (profile.linkedin_url) {
    parts.push(`LinkedIn: ${profile.linkedin_url}`);
  }
  if (profile.experience_summary) {
    parts.push(`\nExperience summary:\n${profile.experience_summary}`);
  } else if (profile.resume_text) {
    parts.push(`\nResume:\n${profile.resume_text}`);
  }
  const focusOptions = profile.focus_options ?? [];
  if (focusOptions.length > 0) {
    parts.push(`\nFocus areas: ${focusOptions.join(", ")}`);
  }
  if (profile.semester_goal) {
    parts.push(`\nSemester goal: ${profile.semester_goal}`);
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
