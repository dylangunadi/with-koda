import type { OnboardingExtracted } from "@/lib/types";

/**
 * The server-side checklist for conversational onboarding.
 * The conversation is done when every required field below has a value in
 * the conversation's extracted state. The model's opinion is advisory only.
 */
export const ONBOARDING_FIELDS: {
  key: keyof OnboardingExtracted;
  required: boolean;
  question: string;
}[] = [
  {
    key: "name",
    required: true,
    question:
      "First, a quick intro. What is your name, where do you go to school, and what year are you?",
  },
  {
    key: "target_roles",
    required: true,
    question:
      "What kinds of roles are you going after? For example product management, software engineering, design, or something else.",
  },
  {
    key: "target_companies",
    required: true,
    question:
      "Which companies or kinds of organizations are you most excited about? Name a few, even loosely.",
  },
  {
    key: "recruiting_stage",
    required: true,
    question:
      "Where are you in the process right now? Just starting to look, actively applying, interviewing, or waiting on something?",
  },
  {
    key: "timeline",
    required: true,
    question:
      "What is your timing? Any deadlines coming up, or a target date you are working toward?",
  },
  {
    key: "locations",
    required: true,
    question:
      "Where do you want to work, location wise? And mention any work authorization constraints if they apply to you.",
  },
  {
    key: "contacts",
    required: true,
    question:
      "Do you already know anyone useful here? Think alumni, past internship contacts, family friends in the industry. A rough description is fine, or say none yet.",
  },
  {
    key: "proof_points",
    required: true,
    question:
      "What have you built or done that you are proud of? Projects, internships, research, anything that shows what you can do.",
  },
  {
    key: "success_definition",
    required: true,
    question:
      "Last one. In a single sentence, what would make this semester a win for you?",
  },
];

const LIST_FIELDS = new Set<keyof OnboardingExtracted>([
  "target_roles",
  "target_companies",
  "locations",
]);

function hasValue(extracted: OnboardingExtracted, key: keyof OnboardingExtracted): boolean {
  const v = extracted[key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return String(v).trim().length > 0;
}

export function missingFields(extracted: OnboardingExtracted): (keyof OnboardingExtracted)[] {
  return ONBOARDING_FIELDS.filter((f) => f.required && !hasValue(extracted, f.key)).map(
    (f) => f.key
  );
}

export function onboardingDone(extracted: OnboardingExtracted): boolean {
  return missingFields(extracted).length === 0;
}

/**
 * Merge an extraction delta into existing state. Additive only: a turn can add
 * or refine fields but never clears one, so nothing the user said is lost.
 */
export function mergeExtracted(
  current: OnboardingExtracted,
  delta: Partial<OnboardingExtracted>
): OnboardingExtracted {
  const next: OnboardingExtracted = { ...current };
  for (const field of ONBOARDING_FIELDS) {
    const key = field.key;
    const value = delta[key];
    if (value == null) continue;
    if (LIST_FIELDS.has(key)) {
      const list = (Array.isArray(value) ? value : [String(value)])
        .map((s) => String(s).trim())
        .filter(Boolean);
      if (list.length > 0) {
        (next[key] as string[]) = list;
      }
    } else {
      const str = String(value).trim();
      if (str) {
        (next[key] as string) = str;
      }
    }
  }
  // work_auth rides along with the locations question but is optional
  if (delta.work_auth != null && String(delta.work_auth).trim()) {
    next.work_auth = String(delta.work_auth).trim();
  }
  if (delta.school != null && String(delta.school).trim()) {
    next.school = String(delta.school).trim();
  }
  if (delta.year != null && String(delta.year).trim()) {
    next.year = String(delta.year).trim();
  }
  return next;
}
