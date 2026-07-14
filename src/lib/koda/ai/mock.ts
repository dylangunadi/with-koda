import type { AgentContext, OnboardingExtracted, Profile } from "@/lib/types";
import { ONBOARDING_FIELDS, missingFields, mergeExtracted } from "@/lib/koda/onboarding";
import type {
  GeneratedMove,
  KodaAI,
  OnboardingTurnInput,
  OnboardingTurnResult,
  OngoingTurnInput,
  OngoingTurnResult,
  ProfileDiffEntry,
  ProposedRelationship,
} from "./provider";

/**
 * Deterministic offline provider. Used when KODA_AI_MOCK=1 or when no
 * ANTHROPIC_API_KEY is configured (the fallback documented in .env.example).
 *
 * Honesty rules:
 * - Every value is derived from text the user actually provided. Nothing is
 *   invented: no people, no companies, no openings the user did not mention.
 * - Output is labeled: source notes carry an "Offline sample mode" prefix and
 *   the provider reports mode "mock" so the UI can show an offline indicator.
 */

const MOCK_NOTE = "Offline sample mode: grounded only in your onboarding answers.";

/** Deterministic streaming: emit the reply in small word groups with short
 * pauses, so the streaming pipeline is exercised end to end offline. */
async function streamReply(reply: string, onDelta?: (text: string) => void): Promise<void> {
  if (!onDelta) return;
  const words = reply.split(" ");
  for (let i = 0; i < words.length; i += 3) {
    onDelta((i > 0 ? " " : "") + words.slice(i, i + 3).join(" "));
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
}

function splitList(text: string): string[] {
  return text
    .split(/,|\band\b|\bor\b|;/i)
    .map((s) => s.trim().replace(/^(maybe|mostly|probably|ideally|like)\s+/i, "").trim())
    .filter((s) => s.length > 0 && s.length < 80)
    .slice(0, 8);
}

function firstSentence(text: string, max = 160): string {
  const s = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return s.trim().slice(0, max);
}

function extractForField(
  key: keyof OnboardingExtracted,
  message: string
): Partial<OnboardingExtracted> {
  const text = message.trim();
  if (!text) return {};
  switch (key) {
    case "name": {
      const delta: Partial<OnboardingExtracted> = {};
      const nameMatch = text.match(/(?:i'?m|i am|name is|this is|call me)\s+([A-Za-z][A-Za-z'-]*)/i);
      delta.name = (nameMatch?.[1] ?? text.split(/[,.]/)[0]).trim().slice(0, 60);
      const schoolMatch = text.match(/(?:at|attend(?:ing)?|study(?:ing)? at|go to)\s+([A-Z][A-Za-z&.' -]{2,60})/);
      if (schoolMatch) delta.school = schoolMatch[1].trim().replace(/[.,;]$/, "");
      const yearMatch = text.match(/\b(freshman|sophomore|junior|senior|graduate|grad student|masters|phd)\b/i);
      if (yearMatch) {
        const y = yearMatch[1].toLowerCase();
        delta.year = y.charAt(0).toUpperCase() + y.slice(1);
      }
      return delta;
    }
    case "target_roles":
      return { target_roles: splitList(text) };
    case "target_companies":
      return { target_companies: splitList(text) };
    case "recruiting_stage": {
      const lower = text.toLowerCase();
      if (/(just|barely)?\s*start|beginning|early|exploring/.test(lower)) return { recruiting_stage: "just starting" };
      if (/interview/.test(lower)) return { recruiting_stage: "interviewing" };
      if (/apply/.test(lower)) return { recruiting_stage: "actively applying" };
      if (/network/.test(lower)) return { recruiting_stage: "networking" };
      if (/offer/.test(lower)) return { recruiting_stage: "evaluating offers" };
      return { recruiting_stage: firstSentence(text, 100) };
    }
    case "timeline":
      return { timeline: firstSentence(text, 200) };
    case "locations": {
      const authPattern = /visa|sponsor|citizen|authoriz|\bopt\b|\bcpt\b|international/i;
      const parts = splitList(text);
      const locations = parts.filter((item) => !authPattern.test(item));
      const delta: Partial<OnboardingExtracted> = { locations };
      const authParts = text
        .split(/,|;/)
        .map((s) => s.trim())
        .filter((s) => authPattern.test(s));
      if (authParts.length) {
        delta.work_auth = authParts.join(", ").slice(0, 160);
      }
      if (!delta.locations || delta.locations.length === 0) delta.locations = [firstSentence(text, 80)];
      return delta;
    }
    case "contacts":
      return { contacts: text.slice(0, 500) };
    case "proof_points":
      return { proof_points: text.slice(0, 500) };
    case "success_definition":
      return { success_definition: firstSentence(text, 240) };
    default:
      return {};
  }
}

function questionFor(key: keyof OnboardingExtracted): string {
  return ONBOARDING_FIELDS.find((f) => f.key === key)?.question ?? "Tell me more.";
}

function acknowledgment(key: keyof OnboardingExtracted, delta: Partial<OnboardingExtracted>): string {
  switch (key) {
    case "name":
      return delta.name ? `Good to meet you, ${delta.name}.` : "Got it.";
    case "target_roles":
      return delta.target_roles?.length ? `Noted: ${delta.target_roles.join(", ")}.` : "Noted.";
    case "target_companies":
      return delta.target_companies?.length ? `Good targets: ${delta.target_companies.join(", ")}.` : "Noted.";
    case "recruiting_stage":
      return delta.recruiting_stage ? `Understood, ${delta.recruiting_stage}.` : "Understood.";
    case "contacts":
      return "Helpful. I will keep that in mind.";
    case "proof_points":
      return "That gives me something concrete to work with.";
    default:
      return "Got it.";
  }
}

async function onboardingTurn(input: OnboardingTurnInput): Promise<OnboardingTurnResult> {
  const target = input.missing[0];
  if (!target) {
    const reply =
      "I have everything I need. Review what I learned below, fix anything that is off, and I will build your first brief.";
    await streamReply(reply, input.onDelta);
    return { reply, extracted: {} };
  }
  // Skips and uncertainty are answers too: record them and move on.
  const skipping = /^(skip|pass|not sure|no idea|i don'?t know|dunno|nothing( yet)?|none yet)\b/i.test(
    input.userMessage.trim()
  );
  const delta = skipping
    ? ({ [target]: ["target_roles", "target_companies", "locations"].includes(target)
        ? ["not sure yet"]
        : "not sure yet" } as Partial<OnboardingExtracted>)
    : extractForField(target, input.userMessage);
  const merged = mergeExtracted(input.extracted, delta);
  const remaining = missingFields(merged);
  const ack = acknowledgment(target, delta);
  const reply = remaining.length
    ? `${ack} ${questionFor(remaining[0])}`
    : `${ack} That is everything I need. Review what I learned below, fix anything that is off, and confirm to get your first brief.`;
  await streamReply(reply, input.onDelta);
  return { reply, extracted: delta };
}

function pick<T>(arr: T[] | null | undefined, i = 0): T | null {
  return arr && arr.length > i ? arr[i] : null;
}

// ---------- ongoing conversation (deterministic, grounded in user text) ----------

const CONTEXT_VERBS = /\b(spoke|talked|met|chatted|coffee|called|caught up|connected|had a call)\b/i;
const UPDATE_MARKERS = /\b(no longer|not interested in|instead of|now (?:targeting|looking|want)|i(?:'m| am) now|change my|switch(?:ing)? (?:to|my)|update my)\b/i;
const NEXT_MOVE_MARKERS = /\b(what should i do|what next|what's next|next move|what now|where should i focus)\b/i;

function extractRelationship(message: string): ProposedRelationship | null {
  // "…Maya at Notion…" / "…with Sam from Figma…" — names and orgs come only
  // from the user's own words.
  const pair = message.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?)\s+(?:at|from|of)\s+([A-Z][A-Za-z0-9&.' -]{1,40}?)(?=[\s,.!?]|$)/);
  const withName = message.match(/\b(?:with|to)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/);
  const personName = pair?.[1] ?? withName?.[1] ?? null;
  if (!personName) return null;
  const organization = pair?.[2]?.trim().replace(/[.,;]$/, "") ?? null;
  const roleMatch = message.match(/\b(?:a|an|the|she'?s|he'?s|they'?re)\s+([A-Za-z ]{2,30}?(?:manager|engineer|designer|recruiter|analyst|pm|founder|director|lead))\b/i);
  const today = new Date();
  let interactionDate: string | null = null;
  if (/\btoday\b/i.test(message)) interactionDate = today.toISOString().slice(0, 10);
  else if (/\byesterday\b/i.test(message)) {
    interactionDate = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  }
  let followUpDate: string | null = null;
  const followIn = message.match(/follow(?:ing)? up (?:in|after) (\d+) (day|week)s?/i);
  if (followIn) {
    const days = parseInt(followIn[1], 10) * (followIn[2].toLowerCase() === "week" ? 7 : 1);
    followUpDate = new Date(today.getTime() + days * 86400000).toISOString().slice(0, 10);
  }
  return {
    person_name: personName,
    organization,
    role_title: roleMatch?.[1]?.trim() ?? null,
    context: message.slice(0, 500),
    interaction_date: interactionDate,
    follow_up_date: followUpDate,
  };
}

function extractProfileDiff(fullMessage: string): ProfileDiffEntry[] {
  const diff: ProfileDiffEntry[] = [];
  // Drop negated clauses ("no longer interested in consulting") so extraction
  // only sees what the user is moving TOWARD.
  const message = fullMessage
    .split(/,|;|\.\s/)
    .filter((s) => !/\b(no longer|not interested|stopped|dropping|quit|done with)\b/i.test(s))
    .join(", ");
  // "targeting X roles" / "want X roles in Y"
  const rolesMatch = message.match(/(?:targeting|want|looking for|interested in|switch(?:ing)? to)\s+([a-z][a-z /&-]*?(?:\s+roles?)?)(?:\s+(?:in|at)\s+|[,.!?]|$)/i);
  if (rolesMatch) {
    const roles = splitList(rolesMatch[1].replace(/\s+roles?$/i, "")).filter(Boolean);
    if (roles.length) diff.push({ field: "target_roles", new_value: roles });
  }
  const locMatch = message.match(/\b(?:in|based in|move to|relocating to)\s+([A-Z][A-Za-z ]{1,30}?)(?:[,.!?]|$)/);
  if (locMatch) {
    diff.push({ field: "locations", new_value: splitList(locMatch[1]) });
  }
  const stageMatch = message.match(/\b(?:i'?m|i am) (?:now )?(interviewing|actively applying|networking|evaluating offers|just starting)\b/i);
  if (stageMatch) {
    diff.push({ field: "recruiting_stage", new_value: stageMatch[1].toLowerCase() });
  }
  return diff;
}

async function ongoingTurn(input: OngoingTurnInput): Promise<OngoingTurnResult> {
  const result = await computeOngoingTurn(input);
  await streamReply(result.reply, input.onDelta);
  return result;
}

async function computeOngoingTurn(input: OngoingTurnInput): Promise<OngoingTurnResult> {
  const message = input.userMessage;

  if (NEXT_MOVE_MARKERS.test(message)) {
    const followUp = [...input.grounding.relationships]
      .filter((r) => r.follow_up_date)
      .sort((a, b) => (a.follow_up_date! < b.follow_up_date! ? -1 : 1))[0];
    if (followUp) {
      // follow_up_date may arrive as YYYY-MM-DD or a full ISO timestamp
      // depending on the driver; show the date part only.
      const followUpDay = String(followUp.follow_up_date).slice(0, 10);
      return {
        intent: "ask_next_move",
        reply: `Your highest-leverage move is following up with ${followUp.person_name}${followUp.organization ? ` at ${followUp.organization}` : ""}. You planned to circle back around ${followUpDay}, and a warm thread beats any cold application. Draft two lines referencing your last conversation and send them today.`,
      };
    }
    const openMove = [...input.grounding.recentMoves]
      .filter((m) => m.status === "generated" || m.status === "accepted" || m.status === "saved")
      .sort((a, b) => b.confidence - a.confidence)[0];
    if (openMove) {
      return {
        intent: "ask_next_move",
        reply: `Finish the move already on your board: "${openMove.title}"${openMove.company ? ` (${openMove.company})` : ""}. It is ${openMove.status} and the strongest fit in your current brief. Complete it before adding anything new.`,
      };
    }
    return {
      intent: "ask_next_move",
      reply: "Your board is clear. Run Koda from your inbox to generate a fresh brief, and tell me about any new conversations so I can work them into it.",
    };
  }

  if (UPDATE_MARKERS.test(message)) {
    const profileDiff = extractProfileDiff(message);
    if (profileDiff.length) {
      const summary = profileDiff
        .map((d) => `${d.field.replace(/_/g, " ")} to ${Array.isArray(d.new_value) ? d.new_value.join(", ") : d.new_value}`)
        .join(" and ");
      return {
        intent: "update_profile",
        reply: `That changes your plan. I would update your ${summary}. Confirm below and every future brief uses the new direction; your history stays intact.`,
        proposal: { profile_diff: profileDiff },
      };
    }
    return {
      intent: "chat",
      reply: "Sounds like your goals moved. Tell me the new target in one line, for example: I am now targeting data roles in New York.",
    };
  }

  if (CONTEXT_VERBS.test(message)) {
    const relationship = extractRelationship(message);
    if (relationship) {
      return {
        intent: "add_context",
        reply: `Good context. I would remember ${relationship.person_name}${relationship.organization ? ` at ${relationship.organization}` : ""}${relationship.follow_up_date ? `, with a follow-up around ${relationship.follow_up_date}` : ""}. Confirm below and future briefs build on it.`,
        proposal: { relationships: [relationship] },
      };
    }
    return {
      intent: "chat",
      reply: "I want to save that correctly. Who did you talk to, and where do they work? For example: I spoke to Maya at Notion yesterday.",
    };
  }

  return {
    intent: "chat",
    reply: "I can save new conversations you have had, update your goals, or tell you what to do next. Try: I met Sam at Linear yesterday, or: what should I do next?",
  };
}

async function generateMoves(profile: Profile, agentContext?: AgentContext): Promise<GeneratedMove[]> {
  const { buildExternalRefs, isEventUpcoming } = await import("@/lib/koda/grounding");
  const role = pick(profile.target_roles) ?? "your target role";
  const company = pick(profile.target_companies) ?? "one of your target companies";
  const secondCompany = pick(profile.target_companies, 1);
  const contacts = (profile.contacts_notes ?? "").trim();
  const hasContacts = contacts.length > 0 && !/^(none|no(ne)? yet|nobody|no one)\b/i.test(contacts);
  const proof = (profile.proof_points ?? profile.resume_text ?? "").trim();
  const stage = profile.recruiting_stage ?? "your current stage";
  const timeline = profile.timeline ?? "your timeline";
  const name = profile.name ?? "there";

  const avoidTitles = new Set(
    (agentContext?.prior_moves ?? []).map((m) => m.title.toLowerCase())
  );

  const moves: GeneratedMove[] = [];

  // 0. Verified external context first: a real calendar event (prep or
  //    follow-up) and a real live posting, each citing its ref exactly like
  //    the live provider is instructed to. This is what makes the grounded
  //    loop browser-testable offline.
  const externalRefs = buildExternalRefs(profile, agentContext);
  const eventRef = externalRefs.find((r) => r.kind === "event" && r.event);
  const threadRef = externalRefs.find((r) => r.kind === "thread" && r.thread);
  const oppRef = externalRefs.find((r) => r.kind === "opportunity" && r.opportunity);

  if (eventRef?.event) {
    const event = eventRef.event;
    const upcoming = isEventUpcoming(event);
    const who = event.attendees.find((a) => a.name)?.name ?? "the person you met";
    const eventTitle = event.title ?? "your meeting";
    moves.push(
      upcoming
        ? {
            title: `Prep for "${eventTitle}"`,
            type: "follow_up",
            company: null,
            person: who,
            fit_reason: `This is on your calendar. Walking in with two sharp questions and one story about your own work turns a pleasant chat into a real step forward.`,
            suggested_action: `Spend 20 minutes on ${who}'s team and recent work, then write down two questions only they can answer.`,
            outreach_draft: "",
            proof_of_work_idea: "",
            follow_up_timing: "Before the event starts.",
            source_note: `${MOCK_NOTE} Built from an event on your connected calendar.`,
            confidence: 0.9,
            priority: "now",
            effort: "20-30 min",
            effort_bucket: "focused",
            expected_outcome: "You show up prepared and memorable instead of generic.",
            source_status: "verified",
            source_ref: eventRef.ref,
          }
        : {
            title: `Send a follow-up for "${eventTitle}"`,
            type: "follow_up",
            company: null,
            person: who,
            fit_reason: `You had this conversation recently. A same-week thank-you with one specific detail keeps the door open; silence closes it.`,
            suggested_action: `Send ${who} a short note today referencing one thing you discussed.`,
            outreach_draft: `Hi ${who}, thank you again for the time. What you said stuck with me, and I have already started acting on it. I would love to keep you posted, and if it ever makes sense to point me toward the right next person or step, I would be grateful.`,
            proof_of_work_idea: "",
            follow_up_timing: "Today or tomorrow; the window closes fast.",
            source_note: `${MOCK_NOTE} Built from an event on your connected calendar.`,
            confidence: 0.9,
            priority: "now",
            effort: "10-15 min",
            effort_bucket: "quick",
            expected_outcome: "The relationship stays warm while the conversation is fresh.",
            source_status: "verified",
            source_ref: eventRef.ref,
          }
    );
  }

  if (threadRef?.thread) {
    const thread = threadRef.thread;
    const counterpart =
      thread.participants.find((p) => p.email && p.email === thread.last_from_email)?.name ??
      "them";
    const subject = thread.subject ?? "your conversation";
    moves.push({
      title: `Reply to "${subject}"`,
      type: "follow_up",
      company: null,
      person: counterpart,
      fit_reason: `This thread is sitting in your inbox with the last word from ${counterpart}. Recruiting conversations go cold fast; a same-week reply keeps this one alive.`,
      suggested_action: `Edit the draft below and reply to ${counterpart} today, from the card's Send button or from Gmail.`,
      outreach_draft: `Hi ${counterpart}, thanks for the note! Yes, I would love to find time this week. I am generally free in the afternoons; happy to work around your calendar. Looking forward to it.`,
      proof_of_work_idea: "",
      follow_up_timing: "Reply today; nudge once more in 4 days if it stays quiet.",
      source_note: `${MOCK_NOTE} Built from a thread imported from your connected inbox.`,
      confidence: 0.9,
      priority: "now",
      effort: "10-15 min",
      effort_bucket: "quick",
      expected_outcome: "The conversation moves forward instead of going cold.",
      source_status: "verified",
      source_ref: threadRef.ref,
    });
  }

  if (oppRef?.opportunity) {
    const opp = oppRef.opportunity;
    moves.push({
      title: `Apply to ${opp.title} at ${opp.company}`,
      type: "opportunity",
      company: opp.company,
      person: null,
      fit_reason: `This role is live on ${opp.company}'s official board right now and matches the targets you named. Verified roles beat speculative ones: the posting is real and linked.`,
      suggested_action: `Read the posting, then draft your application materials for it this week.`,
      outreach_draft: "",
      proof_of_work_idea: "",
      follow_up_timing: "Apply within the week; postings close without warning.",
      source_note: `${MOCK_NOTE} Role found on the company's official job board.`,
      confidence: 0.85,
      priority: "this_week",
      effort: "1-2 hours",
      effort_bucket: "project",
      expected_outcome: "A real application in flight at a company you actually named.",
      source_status: "verified",
      source_ref: oppRef.ref,
    });
  }

  // 1. Relationship move: grounded in the user's own stated contacts when they
  //    exist, otherwise an explicitly archetypal outreach at a stated target.
  if (hasContacts) {
    moves.push({
      title: `Reconnect with a contact you already have`,
      type: "person_to_contact",
      company: null,
      person: "Someone you already know (from your onboarding notes)",
      fit_reason: `You told Koda you already know people who can help: "${contacts.slice(0, 160)}". A warm contact is worth more than ten cold applications, especially while you are ${stage}.`,
      suggested_action: "Send a short reconnect message to the most relevant person from your notes today.",
      outreach_draft: `Hi! It has been a while since we talked. I am focusing my search on ${role} work right now${secondCompany ? ` at places like ${company} and ${secondCompany}` : company !== "one of your target companies" ? ` at places like ${company}` : ""}, and I would really value 15 minutes to hear how things look from where you sit. Any chance you have time this week or next?`,
      proof_of_work_idea: "",
      follow_up_timing: "If no reply, follow up once after 4 days.",
      source_note: `${MOCK_NOTE} Person comes from the contacts you described during onboarding.`,
      confidence: 0.75,
      priority: "now",
      effort: "20-30 min",
      effort_bucket: "focused",
      expected_outcome: "One warm conversation scheduled with someone you already know.",
      source_status: "user_provided",
      source_ref: null,
    });
  } else {
    moves.push({
      title: `Find one ${role} person at ${company} to learn from`,
      type: "person_to_contact",
      company: company === "one of your target companies" ? null : company,
      person: `An early-career ${role} person at ${company}${profile.school ? `, ideally a ${profile.school} alum` : ""} (archetype, not a specific individual)`,
      fit_reason: `You said you do not have contacts yet, so the highest-value first step is creating one at a company you actually named: ${company}.`,
      suggested_action: `Search your school's alumni network or LinkedIn for one person matching this archetype and send a short note.`,
      outreach_draft: `Hi! I am ${name}${profile.school ? `, a ${profile.year ?? "student"} at ${profile.school}` : ""}. I am working toward ${role} roles and ${company} is at the top of my list. Could I ask you two or three specific questions about your path? Happy to work around your schedule.`,
      proof_of_work_idea: "",
      follow_up_timing: "If no reply, follow up once after 5 days.",
      source_note: `${MOCK_NOTE} Company comes from your stated targets; the person is an archetype for you to find, not an invented individual.`,
      confidence: 0.65,
      priority: "this_week",
      effort: "30-45 min",
      effort_bucket: "focused",
      expected_outcome: "One real conversation started at a stated target company.",
      source_status: "ai_suggested",
      source_ref: null,
    });
  }

  // 2. Proof-of-work move grounded in the user's stated projects/skills.
  moves.push({
    title: `Turn your strongest project into a ${role} artifact`,
    type: "proof_of_work",
    company: secondCompany ?? (company === "one of your target companies" ? null : company),
    person: null,
    fit_reason: proof
      ? `You described real work: "${proof.slice(0, 160)}". Packaged into a short, shareable artifact, it becomes evidence you can attach to outreach and applications.`
      : `A small tangible artifact aimed at ${role} work gives your outreach and applications something concrete to point at.`,
    suggested_action: proof
      ? "Write a one-page summary of that project: the problem, what you did, what changed. Publish it where you can link to it."
      : `Spend two hours producing a one-page analysis relevant to ${role} work and publish it where you can link to it.`,
    outreach_draft: "",
    proof_of_work_idea: proof
      ? `A one-page write-up of the work you described (${proof.slice(0, 80)}...), framed for ${role} reviewers: problem, action, result, what you would do next.`
      : `A one-page memo analyzing something concrete in the space you are targeting, written for ${role} reviewers.`,
    follow_up_timing: "Complete within 3 days so you can reference it in this week's outreach.",
    source_note: `${MOCK_NOTE} Built from the projects and skills you described.`,
    confidence: 0.7,
    priority: "this_week",
    effort: "1-2 hours",
    effort_bucket: "project",
    expected_outcome: "A linkable artifact that upgrades every application and message you send.",
    source_status: proof ? "inferred" : "ai_suggested",
    source_ref: null,
  });

  // 3. Strategy move grounded in stated stage and timeline.
  moves.push({
    title: `Set your ${stage} plan against your actual deadline`,
    type: "application_strategy",
    company: null,
    person: null,
    fit_reason: `You are ${stage} with this timing: "${timeline.slice(0, 140)}". A short written plan keeps the next two weeks pointed at your own deadline instead of drifting.`,
    suggested_action: `Write down the next two weeks: which of your named targets (${(profile.target_companies ?? []).slice(0, 3).join(", ") || "your targets"}) you touch each week, and what you send them.`,
    outreach_draft: "",
    proof_of_work_idea: "",
    follow_up_timing: "Review and adjust the plan every Sunday.",
    source_note: `${MOCK_NOTE} Uses only your stated stage, targets, and timing.`,
    confidence: 0.6,
    priority: "soon",
    effort: "30 min",
    effort_bucket: "focused",
    expected_outcome: "A two-week plan matched to your stated deadline, so effort lands where you said it matters.",
    source_status: "inferred",
    source_ref: null,
  });

  // Never repeat a title the user already has (cheap dedupe for regeneration),
  // and always exactly 3 moves: verified-grounded ones take the front slots.
  return moves
    .map((m) =>
      avoidTitles.has(m.title.toLowerCase()) ? { ...m, title: `${m.title} (next step)` } : m
    )
    .slice(0, 3);
}

export const mockProvider: KodaAI = {
  mode: "mock",
  onboardingTurn,
  ongoingTurn,
  generateMoves,
};
