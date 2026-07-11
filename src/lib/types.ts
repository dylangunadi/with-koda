export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  school: string | null;
  year: string | null;
  target_roles: string[];
  target_companies: string[];
  industries: string[];
  locations: string[];
  work_auth: string | null;
  resume_text: string | null;
  linkedin_url: string | null;
  contacts_notes: string | null;
  semester_goal: string | null;
  created_at: string;
  updated_at: string;
}

export type MoveStatus = "generated" | "accepted" | "rejected" | "sent" | "saved";

export type MoveType =
  | "opportunity"
  | "person_to_contact"
  | "follow_up"
  | "proof_of_work"
  | "application_strategy";

export type MoveEventType =
  | "generated"
  | "accepted"
  | "rejected"
  | "edited"
  | "sent"
  | "saved"
  | "regenerated";

export interface RecruitingMove {
  id: string;
  user_id: string;
  title: string;
  type: MoveType;
  company: string | null;
  person: string | null;
  fit_reason: string | null;
  suggested_action: string | null;
  outreach_draft: string | null;
  proof_of_work_idea: string | null;
  follow_up_timing: string | null;
  confidence: number;
  status: MoveStatus;
  created_at: string;
  updated_at: string;
}

export interface MoveEvent {
  id: string;
  move_id: string;
  user_id: string;
  event_type: MoveEventType;
  metadata: Record<string, unknown>;
  created_at: string;
}
