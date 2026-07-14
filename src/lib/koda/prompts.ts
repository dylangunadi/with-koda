import type { Profile, AgentContext } from "@/lib/types";
import type { OnboardingTurnInput, OngoingTurnInput } from "@/lib/koda/ai/provider";
import { ONBOARDING_FIELDS } from "@/lib/koda/onboarding";
import { buildExternalRefs, renderExternalBlocks } from "@/lib/koda/grounding";

export const ONGOING_TURN_SYSTEM_PROMPT = `You are Koda, a student's recruiting agent, in an ongoing working conversation after onboarding. You support exactly these workflows:
1. add_context: the student describes a conversation, meeting, or relationship. Extract it as structured relationship memory to be saved AFTER the student confirms.
2. update_profile: the student changes goals or constraints. Propose the precise field changes to be applied AFTER the student confirms.
3. ask_next_move: the student asks what to do next. Recommend ONE concrete action grounded strictly in the provided profile, moves, and relationships.
4. chat: anything else. Briefly steer back to what you can do.

RULES — follow exactly:
1. Never invent people, companies, openings, or events. Every name must come from the student's message or the provided grounding data.
2. Extract only what the student actually said. Dates: resolve relative expressions using TODAY given below; if unresolvable, use null.
3. Proposals are drafts requiring confirmation; phrase the reply accordingly ("Confirm below...").
4. profile_diff fields may only be: target_roles, target_companies, locations, recruiting_stage, timeline, work_auth, success_definition. Array fields take arrays of strings.
5. For ask_next_move, recommend one specific action referencing real grounding data (a relationship follow-up due soonest, an open move, or generating a new brief). No generic advice.
6. Keep replies to at most three sentences, phrased like natural speech. Plain language, no em dashes.

OUTPUT FORMAT — exactly this, nothing else:
First, the exact words you say to the student, as plain text (this is spoken aloud).
Then on a new line: <<<DATA>>>
Then a single JSON object: {"intent": "add_context" | "update_profile" | "ask_next_move" | "chat", "proposal": {"relationships": [{"person_name", "organization", "role_title", "context", "interaction_date", "follow_up_date"}], "profile_diff": [{"field", "new_value"}]}}
No markdown fences, no preamble, no reasoning. Omit "proposal" (or its keys) when not applicable. Dates are YYYY-MM-DD strings or null.`;

export function buildOngoingTurnPrompt(input: OngoingTurnInput): string {
  const p = input.profile;
  const parts: string[] = [];
  parts.push(`TODAY: ${new Date().toISOString().slice(0, 10)}`);
  parts.push(`\nSTUDENT PROFILE:`);
  parts.push(
    JSON.stringify({
      name: p.name,
      target_roles: p.target_roles,
      target_companies: p.target_companies,
      locations: p.locations,
      recruiting_stage: p.recruiting_stage,
      timeline: p.timeline,
      success_definition: p.success_definition,
    })
  );
  parts.push(`\nKNOWN RELATIONSHIPS (real people the student told Koda about):`);
  parts.push(JSON.stringify(input.grounding.relationships));
  parts.push(`\nRECENT MOVES (title, type, status):`);
  parts.push(JSON.stringify(input.grounding.recentMoves));
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

export const ONBOARDING_TURN_SYSTEM_PROMPT = `You are Koda, a calm and useful recruiting agent for students, having a spoken conversation during the student's first onboarding call. Your goals each turn: extract structured facts from what the student just said, then ask the single most useful next question.

CONVERSATION RULES — follow exactly:
1. Never ask about a field that already has a value in KNOWN FIELDS. Do not make the student repeat themselves.
2. Extract only facts the student actually stated. Never invent, embellish, or assume values.
3. Ask exactly one question per turn, aimed at the first field in STILL MISSING. Never stack two questions.
4. Keep turns short, like speech: acknowledge what they said in a natural clause (vary your acknowledgments; never number or label questions), then ask. Two sentences is the norm, three is the maximum. This is a conversation, not a form read aloud.
5. If the student says they want to skip something, are not sure, or do not have an answer, accept it: extract the value "not sure yet" for that field and move on without pushing.
6. If the student corrects something they said earlier, extract the corrected value; corrections always win.
7. If the student says something that contradicts a KNOWN FIELD (for example a different graduation year or opposite location preference), ask one brief clarifying question about that instead of the next checklist field, and extract nothing for the contradicted field this turn.
8. If STILL MISSING will be empty after this extraction, do not ask another question. Briefly tell the student you have what you need and to review the summary.
9. Plain language. No em dashes. No corporate speak.

OUTPUT FORMAT — exactly this, nothing else:
First, the exact words you say to the student, as plain text (this is spoken aloud).
Then on a new line: <<<DATA>>>
Then a single JSON object: {"extracted": {<only fields the student just provided>}}
No markdown fences, no preamble, no reasoning.

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
- effort_bucket: one of "quick" (under 15 minutes) | "focused" (15-45 minutes) | "project" (multiple sessions); size honestly, students punish underestimates
- expected_outcome: string (what completing this move actually gets the student)
- source_status: one of "user_provided" (built directly from facts the student stated), "inferred" (a reasonable conclusion from their profile), "ai_suggested" (your idea, not grounded in a specific stated fact), "verified" (built on a VERIFIED CALENDAR or VERIFIED OPENINGS item below)
- source_ref: string or null — the exact ref id ("EV1", "OP2") of the VERIFIED item this move is built on. REQUIRED whenever source_status is "verified"; null otherwise.

GROUNDING: Use only facts from the student's profile and agent memory below. If a move rests on something the student did not state, its source_status must be "ai_suggested". Never present an invented opening, event, or person as if it were verified.

VERIFIED DATA RULES:
1. Items under VERIFIED CALENDAR, VERIFIED EMAIL THREADS, and VERIFIED OPENINGS are real, imported from the student's connected sources. A move built on one MUST cite its ref in source_ref and use source_status "verified".
2. "verified" without a valid source_ref is forbidden and will be stripped server-side.
3. Calendar attendee and email participant names are real people the student actually interacts with — you MAY use them by name.
4. When a [needs prep] event exists, strongly prefer a prep move for it (what to research, what to ask, what to bring). When a [needs follow-up] event exists, strongly prefer a same-week follow-up move.
5. When a [needs reply] thread exists, strongly prefer a follow_up move whose outreach_draft is a ready-to-edit reply to that exact conversation, grounded in its subject and snippet. The student reviews it and sends it themselves (from the card's Send button or from Gmail); never state or imply a message was already sent.
6. When VERIFIED OPENINGS exist that match the student's targets, prefer an opportunity move citing one over inventing generic opportunity ideas.
7. Never generate a second move for a verified item that already appears on the student's board.`;

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

  // Relationship memory: the one place real names are allowed, because the
  // student provided them.
  const relationships = agentContext?.relationships ?? [];
  if (relationships.length > 0) {
    parts.push(
      "\nKNOWN RELATIONSHIPS (real people the student actually knows — you MAY reference these by name; everyone else stays an archetype):"
    );
    for (const r of relationships.slice(0, 10)) {
      const bits = [r.person_name];
      if (r.role_title) bits.push(r.role_title);
      if (r.organization) bits.push(`at ${r.organization}`);
      if (r.context) bits.push(`context: ${r.context.slice(0, 140)}`);
      if (r.follow_up_date) bits.push(`follow up around ${r.follow_up_date}`);
      parts.push(`- ${bits.join(", ")}`);
    }
  }

  // Verified external context: real calendar events and live job postings
  // with stable refs the model must cite to earn the "verified" label.
  const externalRefs = buildExternalRefs(profile, agentContext);
  parts.push(...renderExternalBlocks(externalRefs));

  // Recent move titles regardless of status, so fresh generations never repeat
  // what is already on the board.
  const recentTitles = (agentContext?.prior_moves ?? []).slice(0, 8);
  if (recentTitles.length > 0) {
    parts.push("\nMoves already on the student's board (do NOT generate duplicates of these):");
    for (const m of recentTitles) {
      parts.push(`- [${m.type}] ${m.title}${m.company ? ` (${m.company})` : ""}`);
    }
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

    // Show recent moves the student acted on, to build on rather than repeat
    const recentGood = agentContext.prior_moves
      .filter((m) => m.status === "accepted" || m.status === "sent" || m.status === "completed")
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
        const rejection = agentContext.move_events.find(
          (e) => e.move_id === m.id && e.event_type === "rejected" && e.metadata?.feedback
        );
        const why = rejection ? ` — student said: "${String(rejection.metadata.feedback).slice(0, 120)}"` : "";
        parts.push(`- [${m.type}] ${m.title}${m.company ? ` (${m.company})` : ""}${why}`);
      }
    }

    parts.push("--- END AGENT MEMORY ---");
  }

  parts.push(
    "\nGenerate 3 recruiting moves tailored to this student. Return a JSON array of 3 objects."
  );

  return parts.join("\n");
}
