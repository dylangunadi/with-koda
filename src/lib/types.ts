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
  focus_options: string[];
  semester_goal: string | null;
  contacts_notes: string | null;
  recruiting_stage: string | null;
  timeline: string | null;
  proof_points: string | null;
  success_definition: string | null;
  autonomous_enabled: boolean;
  brief_frequency: string;
  brief_email: string | null;
  brief_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

// 'sent' is a legacy status kept for existing rows; the UI and API no longer
// accept it (Koda has no sending integration, so nothing may claim "sent").
export type MoveStatus = "generated" | "accepted" | "rejected" | "sent" | "saved" | "completed";

// 'verified' means the move is backed by a live external record (calendar
// event or job posting) with a source URL and fetch time. The label is
// enforced server-side: a generated move claiming 'verified' without a
// resolvable source_ref is downgraded to 'ai_suggested'.
export type MoveSourceStatus = "user_provided" | "inferred" | "ai_suggested" | "verified";

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
  | "completed"
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
  brief_id: string | null;
  priority: string | null;
  effort: string | null;
  effort_bucket: EffortBucket | null;
  actual_effort_bucket: EffortBucket | null;
  expected_outcome: string | null;
  source_status: MoveSourceStatus;
  external_event_id: string | null;
  external_opportunity_id: string | null;
  external_thread_id: string | null;
  source_url: string | null;
  source_fetched_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Broad effort sizing: quick (under 15 min), focused (15-45 min),
 * project (multiple sessions). Predictions are calibrated against the
 * actual bucket users report at completion. */
export type EffortBucket = "quick" | "focused" | "project";

// --- Talk to Koda types ---

export interface Brief {
  id: string;
  user_id: string;
  source: "onboarding" | "manual" | "scheduled";
  brief_date: string;
  summary: string | null;
  created_at: string;
}

export type ConversationKind = "onboarding" | "ongoing";
export type ConversationStatus = "active" | "completed";

/**
 * Structured fields extracted during conversational onboarding.
 * This object (not the transcript) is the source of truth for resume/review.
 */
export interface OnboardingExtracted {
  name?: string;
  school?: string;
  year?: string;
  target_roles?: string[];
  target_companies?: string[];
  recruiting_stage?: string;
  timeline?: string;
  locations?: string[];
  work_auth?: string;
  contacts?: string;
  proof_points?: string;
  success_definition?: string;
}

export interface KodaConversation {
  id: string;
  user_id: string;
  kind: ConversationKind;
  status: ConversationStatus;
  extracted: OnboardingExtracted;
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: string;
  user_id: string;
  person_name: string;
  organization: string | null;
  role_title: string | null;
  context: string | null;
  source_message: string | null;
  source_message_id: string | null;
  interaction_date: string | null;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface KodaMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "koda";
  content: string;
  input_mode: "text" | "voice";
  payload: Record<string, unknown>;
  created_at: string;
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
  relationships: Relationship[];
  calendar: CalendarContext;
  opportunities: ExternalOpportunity[];
  /** Imported threads awaiting the user's reply, capped small. */
  threads: ExternalThread[];
}

// --- Integration types ---

export type IntegrationProvider = "google_calendar" | "job_boards" | "gmail";
export type IntegrationStatus = "connected" | "error" | "pending";

/** A configured job board on the job_boards integration. */
export interface JobBoardConfig {
  company: string;
  ats: "greenhouse" | "lever";
  board_token: string;
  url: string;
}

/** User-visible connection record. Never contains secrets — tokens live in
 * integration_tokens, which no browser client can read. */
export interface Integration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  account_label: string | null;
  scopes: string[];
  config: { calendar_ids?: string[]; boards?: JobBoardConfig[]; queries?: string[] };
  sync_cursor: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export type EventClassification =
  | "coffee_chat"
  | "recruiter_call"
  | "interview"
  | "deadline"
  | "other";

export interface ExternalEventAttendee {
  name: string | null;
  email: string | null;
}

export interface ExternalEvent {
  id: string;
  user_id: string;
  integration_id: string;
  provider: string;
  external_id: string;
  title: string | null;
  description_snippet: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  attendees: ExternalEventAttendee[];
  organizer_email: string | null;
  html_link: string | null;
  event_status: "confirmed" | "cancelled";
  classification: EventClassification | null;
  relationship_id: string | null;
  source_updated_at: string | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export type OpportunityVerification = "verified_live" | "stale" | "closed";

export interface ExternalOpportunity {
  id: string;
  user_id: string;
  integration_id: string;
  provider: "greenhouse" | "lever";
  board_token: string;
  external_id: string;
  company: string;
  title: string;
  location: string | null;
  department: string | null;
  absolute_url: string;
  source_posted_at: string | null;
  source_updated_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  fetched_at: string;
  verification_status: OpportunityVerification;
  created_at: string;
  updated_at: string;
}

export interface ExternalThread {
  id: string;
  user_id: string;
  integration_id: string;
  provider: string;
  external_id: string;
  subject: string | null;
  snippet: string | null;
  participants: ExternalEventAttendee[];
  last_from_email: string | null;
  last_message_at: string | null;
  message_count: number;
  needs_reply: boolean;
  relationship_id: string | null;
  permalink: string | null;
  source_updated_at: string | null;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarContext {
  /** Next 14 days, classified, cancelled excluded. Capped small. */
  upcoming: ExternalEvent[];
  /** Last 7 days, only events without a linked non-rejected move. */
  recent_past: ExternalEvent[];
}

export interface IntegrationSyncRun {
  id: string;
  integration_id: string;
  user_id: string;
  trigger: "scheduled" | "manual" | "initial";
  run_date: string;
  status: "running" | "ok" | "failed";
  stats: Record<string, number>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}
