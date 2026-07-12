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
  company_size: string | null;
  work_auth: string | null;
  resume_text: string | null;
  experience_summary: string | null;
  linkedin_url: string | null;
  focus_options: string[];
  semester_goal: string | null;
  autonomous_enabled: boolean;
  brief_frequency: string;
  brief_email: string | null;
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
  source_note: string | null;
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

// --- Agent context types ---

export interface FeedbackPattern {
  boost_types: MoveType[];
  boost_companies: string[];
  reduce_types: MoveType[];
  reduce_companies: string[];
  tone_signals: string[];
  edited_drafts_count: number;
  total_accepted: number;
  total_rejected: number;
  total_sent: number;
  total_saved: number;
}

export interface AgentContext {
  prior_moves: RecruitingMove[];
  move_events: MoveEvent[];
  feedback: FeedbackPattern;
}

