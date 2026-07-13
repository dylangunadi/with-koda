import { describe, expect, it } from "vitest";
import { buildExternalRefs, renderExternalBlocks, resolveSourceRefs } from "@/lib/koda/grounding";
import type { GeneratedMove } from "@/lib/koda/ai/provider";
import type {
  AgentContext,
  ExternalEvent,
  ExternalOpportunity,
  Profile,
  RecruitingMove,
} from "@/lib/types";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "p1",
    user_id: "u1",
    name: "Test",
    school: null,
    year: null,
    target_roles: ["APM"],
    target_companies: ["Notion"],
    industries: [],
    locations: [],
    work_auth: null,
    resume_text: null,
    linkedin_url: null,
    focus_options: [],
    semester_goal: null,
    contacts_notes: null,
    recruiting_stage: null,
    timeline: null,
    proof_points: null,
    success_definition: null,
    autonomous_enabled: false,
    brief_frequency: "manual",
    brief_email: null,
    brief_confirmed: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
  return {
    id: "ev-row-1",
    user_id: "u1",
    integration_id: "i1",
    provider: "google_calendar",
    external_id: "g-1",
    title: "Coffee chat",
    description_snippet: null,
    start_at: new Date(Date.now() + 86_400_000).toISOString(),
    end_at: null,
    location: null,
    attendees: [{ name: "Jordan Lee", email: "j@x.com" }],
    organizer_email: null,
    html_link: "https://calendar.google.com/e/1",
    event_status: "confirmed",
    classification: "coffee_chat",
    relationship_id: null,
    source_updated_at: null,
    fetched_at: "2026-07-13T00:00:00Z",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeOpp(overrides: Partial<ExternalOpportunity> = {}): ExternalOpportunity {
  return {
    id: "op-row-1",
    user_id: "u1",
    integration_id: "i1",
    provider: "greenhouse",
    board_token: "notion",
    external_id: "42",
    company: "Notion",
    title: "APM Intern",
    location: null,
    department: null,
    absolute_url: "https://boards.greenhouse.io/notion/jobs/42",
    source_posted_at: null,
    source_updated_at: null,
    first_seen_at: "",
    last_seen_at: "",
    fetched_at: "2026-07-13T00:00:00Z",
    verification_status: "verified_live",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    prior_moves: [],
    move_events: [],
    feedback: {
      boost_types: [],
      boost_companies: [],
      reduce_types: [],
      reduce_companies: [],
      tone_signals: [],
      edited_drafts_count: 0,
      total_accepted: 0,
      total_rejected: 0,
      total_sent: 0,
      total_saved: 0,
    },
    relationships: [],
    calendar: { upcoming: [], recent_past: [] },
    opportunities: [],
    ...overrides,
  };
}

function makeMove(overrides: Partial<GeneratedMove> = {}): GeneratedMove {
  return {
    title: "A move",
    type: "follow_up",
    company: null,
    person: null,
    fit_reason: "",
    suggested_action: "",
    outreach_draft: "",
    proof_of_work_idea: "",
    follow_up_timing: "",
    source_note: "",
    confidence: 0.8,
    priority: "now",
    effort: "30 min",
    effort_bucket: "focused",
    expected_outcome: "",
    source_status: "ai_suggested",
    source_ref: null,
    ...overrides,
  };
}

describe("buildExternalRefs", () => {
  it("orders events (upcoming then past) before opportunities, target companies first", () => {
    const ctx = makeContext({
      calendar: {
        upcoming: [makeEvent({ id: "up1" })],
        recent_past: [makeEvent({ id: "past1", external_id: "g-2" })],
      },
      opportunities: [
        makeOpp({ id: "o-other", company: "Elsewhere" }),
        makeOpp({ id: "o-target", company: "Notion", external_id: "43" }),
      ],
    });
    const refs = buildExternalRefs(makeProfile(), ctx);
    expect(refs.map((r) => r.ref)).toEqual(["EV1", "EV2", "OP1", "OP2"]);
    expect(refs[0].event?.id).toBe("up1");
    expect(refs[1].event?.id).toBe("past1");
    expect(refs[2].opportunity?.company).toBe("Notion"); // target first
  });

  it("returns nothing without context", () => {
    expect(buildExternalRefs(makeProfile(), undefined)).toEqual([]);
  });
});

describe("resolveSourceRefs", () => {
  const ctx = makeContext({
    calendar: { upcoming: [makeEvent()], recent_past: [] },
    opportunities: [makeOpp()],
  });

  it("links a valid event ref and copies source url + fetch time", () => {
    const [resolved] = resolveSourceRefs(
      [makeMove({ source_ref: "EV1", source_status: "verified" })],
      makeProfile(),
      ctx
    );
    expect(resolved.source_status).toBe("verified");
    expect(resolved.external_event_id).toBe("ev-row-1");
    expect(resolved.source_url).toBe("https://calendar.google.com/e/1");
    expect(resolved.source_fetched_at).toBe("2026-07-13T00:00:00Z");
  });

  it("links a valid opportunity ref", () => {
    const [resolved] = resolveSourceRefs(
      [makeMove({ source_ref: "OP1", source_status: "verified", type: "opportunity" })],
      makeProfile(),
      ctx
    );
    expect(resolved.external_opportunity_id).toBe("op-row-1");
    expect(resolved.source_url).toBe("https://boards.greenhouse.io/notion/jobs/42");
  });

  it("upgrades to verified when a valid ref is cited without the label", () => {
    const [resolved] = resolveSourceRefs(
      [makeMove({ source_ref: "ev1", source_status: "inferred" })],
      makeProfile(),
      ctx
    );
    expect(resolved.source_status).toBe("verified"); // case-insensitive ref
  });

  it("downgrades verified claims with a bogus or missing ref and strips links", () => {
    const results = resolveSourceRefs(
      [
        makeMove({ source_ref: "EV9", source_status: "verified" }),
        makeMove({ source_ref: null, source_status: "verified" }),
      ],
      makeProfile(),
      ctx
    );
    for (const move of results) {
      expect(move.source_status).toBe("ai_suggested");
      expect(move.external_event_id).toBeNull();
      expect(move.source_url).toBeNull();
      expect(move.source_ref).toBeNull();
    }
  });

  it("leaves non-verified statuses alone when no ref is cited", () => {
    const [resolved] = resolveSourceRefs(
      [makeMove({ source_status: "user_provided" })],
      makeProfile(),
      ctx
    );
    expect(resolved.source_status).toBe("user_provided");
  });

  it("drops a move for an event that already has a non-rejected move (dedup belt)", () => {
    const ctxWithHandled = makeContext({
      calendar: { upcoming: [makeEvent()], recent_past: [] },
      prior_moves: [
        { external_event_id: "ev-row-1", status: "generated" } as RecruitingMove,
      ],
    });
    const results = resolveSourceRefs(
      [makeMove({ source_ref: "EV1", source_status: "verified" })],
      makeProfile(),
      ctxWithHandled
    );
    expect(results).toHaveLength(0);
  });

  it("does not drop when the prior move was rejected", () => {
    const ctxRejected = makeContext({
      calendar: { upcoming: [makeEvent()], recent_past: [] },
      prior_moves: [
        { external_event_id: "ev-row-1", status: "rejected" } as RecruitingMove,
      ],
    });
    const results = resolveSourceRefs(
      [makeMove({ source_ref: "EV1", source_status: "verified" })],
      makeProfile(),
      ctxRejected
    );
    expect(results).toHaveLength(1);
  });
});

describe("renderExternalBlocks", () => {
  it("renders refs, prep/follow-up markers, and source URLs", () => {
    const past = makeEvent({
      id: "past",
      start_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const refs = buildExternalRefs(
      makeProfile(),
      makeContext({
        calendar: { upcoming: [makeEvent()], recent_past: [past] },
        opportunities: [makeOpp()],
      })
    );
    const text = renderExternalBlocks(refs).join("\n");
    expect(text).toContain("[EV1]");
    expect(text).toContain("[needs prep]");
    expect(text).toContain("[needs follow-up]");
    expect(text).toContain("[OP1]");
    expect(text).toContain("https://boards.greenhouse.io/notion/jobs/42");
    expect(text).toContain("Jordan Lee");
  });

  it("renders nothing without external data", () => {
    expect(renderExternalBlocks([])).toEqual([]);
  });
});
