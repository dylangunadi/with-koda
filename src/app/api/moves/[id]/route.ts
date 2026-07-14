import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logKodaEvent, type KodaEventName } from "@/lib/koda/events";
import type { MoveEventType } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 'sent' stays absent from client-settable statuses: real sends happen only
// in /api/integrations/gmail/send, which records them server-side with
// Gmail's message id. No client may merely *claim* a message went out.
const STATUS_TO_EVENT: Record<string, MoveEventType> = {
  generated: "generated",
  accepted: "accepted",
  rejected: "rejected",
  saved: "saved",
  completed: "completed",
};

const MAX_DRAFT_LENGTH = 10000;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Invalid move ID" }, { status: 400 });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const {
    status,
    outreach_draft,
    actual_effort_bucket,
    feedback,
    person_linkedin_url,
    connection_note,
  } = body as {
    status?: string;
    outreach_draft?: string;
    actual_effort_bucket?: string;
    feedback?: string;
    person_linkedin_url?: string;
    connection_note?: string;
  };

  const VALID_BUCKETS = ["quick", "focused", "project"];
  if (actual_effort_bucket !== undefined && !VALID_BUCKETS.includes(actual_effort_bucket)) {
    return NextResponse.json(
      { error: `Invalid effort bucket. Must be one of: ${VALID_BUCKETS.join(", ")}` },
      { status: 400 }
    );
  }
  if (feedback !== undefined && (typeof feedback !== "string" || feedback.length > 500)) {
    return NextResponse.json({ error: "Invalid feedback" }, { status: 400 });
  }

  // Validate outreach_draft length
  if (outreach_draft !== undefined && outreach_draft.length > MAX_DRAFT_LENGTH) {
    return NextResponse.json(
      { error: `Outreach draft too long (max ${MAX_DRAFT_LENGTH} characters)` },
      { status: 400 }
    );
  }

  // LinkedIn connection notes are capped at LinkedIn's own invite limit.
  if (connection_note !== undefined && (typeof connection_note !== "string" || connection_note.length > 300)) {
    return NextResponse.json(
      { error: "Connection note too long (max 300 characters)" },
      { status: 400 }
    );
  }

  // User-pasted profile URL only: https, linkedin.com hostnames. Empty
  // string clears it. Koda never looks people up on LinkedIn itself.
  if (person_linkedin_url !== undefined) {
    if (typeof person_linkedin_url !== "string" || person_linkedin_url.length > 300) {
      return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
    }
    if (person_linkedin_url !== "") {
      let parsed: URL;
      try {
        parsed = new URL(person_linkedin_url);
      } catch {
        return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
      }
      const host = parsed.hostname.toLowerCase();
      const isLinkedIn = host === "linkedin.com" || host.endsWith(".linkedin.com");
      if (parsed.protocol !== "https:" || !isLinkedIn) {
        return NextResponse.json(
          { error: "That does not look like a LinkedIn profile URL" },
          { status: 400 }
        );
      }
    }
  }

  // Verify the move exists and belongs to the user (RLS enforces ownership)
  const { data: existing, error: fetchError } = await supabase
    .from("recruiting_moves")
    .select("id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Move not found" }, { status: 404 });
  }

  // Validate status if provided
  const VALID_STATUSES = Object.keys(STATUS_TO_EVENT);
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  // Build update payload
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status) {
    updates.status = status;
  }

  if (outreach_draft !== undefined) {
    updates.outreach_draft = outreach_draft;
  }

  // Actual effort arrives with completion and calibrates future estimates.
  if (actual_effort_bucket !== undefined) {
    updates.actual_effort_bucket = actual_effort_bucket;
  }

  if (connection_note !== undefined) {
    updates.connection_note = connection_note;
  }
  if (person_linkedin_url !== undefined) {
    updates.person_linkedin_url = person_linkedin_url === "" ? null : person_linkedin_url;
  }

  const { data: updated, error: updateError } = await supabase
    .from("recruiting_moves")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Failed to update move" },
      { status: 500 }
    );
  }

  // Determine event type using explicit mapping
  let eventType: MoveEventType;
  if (status && STATUS_TO_EVENT[status]) {
    eventType = STATUS_TO_EVENT[status];
  } else {
    eventType = "edited";
  }

  // Insert move_event. Optional rejection feedback (why a move was not
  // relevant) rides in metadata and feeds future generations.
  const { error: eventError } = await supabase.from("move_events").insert({
    move_id: id,
    user_id: user.id,
    event_type: eventType,
    metadata: {
      ...(feedback?.trim() ? { feedback: feedback.trim() } : {}),
      ...(actual_effort_bucket ? { actual_effort_bucket } : {}),
    },
  });

  if (eventError) {
    console.error("Failed to insert move event:", eventError);
  }

  const PRODUCT_EVENTS: Record<string, KodaEventName> = {
    accepted: "move_accepted",
    rejected: "move_rejected",
    saved: "move_saved",
    completed: "move_completed",
    edited: "move_edited",
  };
  const productEvent = PRODUCT_EVENTS[eventType];
  if (productEvent) {
    logKodaEvent(supabase, user.id, productEvent, { move_id: id, move_type: updated.type });
  }

  return NextResponse.json({ move: updated });
}
