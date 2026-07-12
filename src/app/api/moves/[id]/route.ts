import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MoveEventType } from "@/lib/types";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 'sent' is intentionally absent: no sending integration exists, so the API
// must not accept a claim that a message went out. Legacy 'sent' rows remain
// readable but no new ones can be created.
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
  const { status, outreach_draft } = body as {
    status?: string;
    outreach_draft?: string;
  };

  // Validate outreach_draft length
  if (outreach_draft !== undefined && outreach_draft.length > MAX_DRAFT_LENGTH) {
    return NextResponse.json(
      { error: `Outreach draft too long (max ${MAX_DRAFT_LENGTH} characters)` },
      { status: 400 }
    );
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

  // Insert move_event
  const { error: eventError } = await supabase.from("move_events").insert({
    move_id: id,
    user_id: user.id,
    event_type: eventType,
    metadata: {},
  });

  if (eventError) {
    console.error("Failed to insert move event:", eventError);
  }

  return NextResponse.json({ move: updated });
}
