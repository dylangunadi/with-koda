import type { AgentContext, OnboardingExtracted, Profile } from "@/lib/types";
import { ONBOARDING_FIELDS, missingFields, mergeExtracted } from "@/lib/koda/onboarding";
import type { GeneratedMove, KodaAI, OnboardingTurnInput, OnboardingTurnResult } from "./provider";

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
    return {
      reply:
        "I have everything I need. Review what I learned below, fix anything that is off, and I will build your first brief.",
      extracted: {},
    };
  }
  const delta = extractForField(target, input.userMessage);
  const merged = mergeExtracted(input.extracted, delta);
  const remaining = missingFields(merged);
  const ack = acknowledgment(target, delta);
  const reply = remaining.length
    ? `${ack} ${questionFor(remaining[0])}`
    : `${ack} That is everything I need. Review what I learned below, fix anything that is off, and confirm to get your first brief.`;
  return { reply, extracted: delta };
}

function pick<T>(arr: T[] | null | undefined, i = 0): T | null {
  return arr && arr.length > i ? arr[i] : null;
}

async function generateMoves(profile: Profile, agentContext?: AgentContext): Promise<GeneratedMove[]> {
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

  // 1. Relationship move: grounded in the user's own stated contacts when they
  //    exist, otherwise an explicitly archetypal outreach at a stated target.
  if (hasContacts) {
    moves.push({
      title: `Reconnect with a contact you already have`,
      type: "person_to_contact",
      company: null,
      person: `From your own notes: "${contacts.slice(0, 120)}"`,
      fit_reason: `You told Koda you already know people who can help: "${contacts.slice(0, 160)}". A warm contact is worth more than ten cold applications, especially while you are ${stage}.`,
      suggested_action: "Send a short reconnect message to the most relevant person from your notes today.",
      outreach_draft: `Hi! It has been a while since we talked. I am focusing my search on ${role} work right now${secondCompany ? ` at places like ${company} and ${secondCompany}` : company !== "one of your target companies" ? ` at places like ${company}` : ""}, and I would really value 15 minutes to hear how things look from where you sit. Any chance you have time this week or next?`,
      proof_of_work_idea: "",
      follow_up_timing: "If no reply, follow up once after 4 days.",
      source_note: `${MOCK_NOTE} Person comes from the contacts you described during onboarding.`,
      confidence: 0.75,
      priority: "now",
      effort: "20-30 min",
      expected_outcome: "One warm conversation scheduled with someone you already know.",
      source_status: "user_provided",
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
      expected_outcome: "One real conversation started at a stated target company.",
      source_status: "ai_suggested",
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
    expected_outcome: "A linkable artifact that upgrades every application and message you send.",
    source_status: proof ? "inferred" : "ai_suggested",
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
    expected_outcome: "A two-week plan matched to your stated deadline, so effort lands where you said it matters.",
    source_status: "inferred",
  });

  // Never repeat a title the user already has (cheap dedupe for regeneration).
  return moves.map((m) =>
    avoidTitles.has(m.title.toLowerCase())
      ? { ...m, title: `${m.title} (next step)` }
      : m
  );
}

export const mockProvider: KodaAI = {
  mode: "mock",
  onboardingTurn,
  generateMoves,
};
