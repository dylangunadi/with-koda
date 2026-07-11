import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MoveEventType } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // Verify the move belongs to the authenticated user
  const { data: existing, error: fetchError } = await supabase
    .from("recruiting_moves")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Move not found" }, { status: 404 });
  }

  if (existing.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate status if provided
  const VALID_STATUSES = ["generated", "accepted", "rejected", "sent", "saved"];
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

  // Determine event type
  let eventType: MoveEventType;
  if (status) {
    eventType = status as MoveEventType;
  } else if (outreach_draft !== undefined) {
    eventType = "edited";
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
