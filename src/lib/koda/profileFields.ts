/**
 * The editable recruiting-profile fields, shared by chat onboarding
 * (confirmOnboarding) and Settings (updateProfile) so both surfaces write the
 * same columns with the same limits. Brief settings are not part of this set:
 * they are managed by /api/briefs.
 */
export interface EditableProfile {
  name: string;
  school: string;
  year: string;
  target_roles: string[];
  target_companies: string[];
  locations: string[];
  work_auth: string;
  recruiting_stage: string;
  timeline: string;
  contacts: string;
  proof_points: string;
  success_definition: string;
}

function clean(value: string | undefined | null, max = 2000): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
}

function cleanList(values: string[] | undefined | null): string[] {
  return (values ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 12);
}

/** Trim, cap, and map editable fields to their profiles columns. */
export function profileColumns(input: EditableProfile) {
  return {
    name: clean(input.name, 120),
    school: clean(input.school, 200),
    year: clean(input.year, 60),
    target_roles: cleanList(input.target_roles),
    target_companies: cleanList(input.target_companies),
    locations: cleanList(input.locations),
    work_auth: clean(input.work_auth, 300),
    recruiting_stage: clean(input.recruiting_stage, 200),
    timeline: clean(input.timeline, 500),
    contacts_notes: clean(input.contacts, 1000),
    proof_points: clean(input.proof_points, 1000),
    success_definition: clean(input.success_definition, 500),
  };
}
