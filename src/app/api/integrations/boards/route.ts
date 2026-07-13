import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  guessBoardForCompany,
  parseBoardUrl,
  validateBoard,
} from "@/lib/koda/integrations/jobs/boards";
import { createServiceClient } from "@/lib/koda/integrations/serviceClient";
import { runJobBoardsSync } from "@/lib/koda/integrations/sync";
import { logKodaEvent } from "@/lib/koda/events";
import type { Integration, JobBoardConfig } from "@/lib/types";

/**
 * Manage the job_boards integration (no OAuth: public ATS endpoints). POST
 * adds a board by company name (guessed token) or pasted board URL; DELETE
 * removes a board and its imported postings. Every added board is validated
 * with a live fetch first.
 */

const MAX_BOARDS = 15;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let company: string;
  let boardUrl: string | null;
  try {
    const body = await request.json();
    company = typeof body.company === "string" ? body.company.trim().slice(0, 80) : "";
    boardUrl = typeof body.board_url === "string" ? body.board_url.trim() : null;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!company) {
    return NextResponse.json({ error: "Company name is required" }, { status: 400 });
  }

  let candidate: JobBoardConfig | null = null;
  if (boardUrl) {
    candidate = parseBoardUrl(boardUrl, company);
    if (!candidate) {
      return NextResponse.json(
        { error: "That does not look like a Greenhouse or Lever board URL." },
        { status: 400 }
      );
    }
    if (!(await validateBoard(candidate))) {
      return NextResponse.json(
        { error: "That board did not respond. Check the URL." },
        { status: 400 }
      );
    }
  } else {
    candidate = await guessBoardForCompany(company);
    if (!candidate) {
      return NextResponse.json(
        {
          error:
            "No public Greenhouse or Lever board found for that company. Paste the board URL if you have it.",
        },
        { status: 404 }
      );
    }
  }

  // Load or create the job_boards integration row.
  const { data: existing } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "job_boards")
    .maybeSingle();

  const boards: JobBoardConfig[] = existing?.config?.boards ?? [];
  if (boards.some((b) => b.ats === candidate.ats && b.board_token === candidate.board_token)) {
    return NextResponse.json({ error: "That board is already added." }, { status: 409 });
  }
  if (boards.length >= MAX_BOARDS) {
    return NextResponse.json({ error: "Board limit reached." }, { status: 400 });
  }

  const nextBoards = [...boards, candidate];
  const { data: integrationRow, error: upsertError } = await supabase
    .from("integrations")
    .upsert(
      {
        ...(existing ? { id: existing.id } : {}),
        user_id: user.id,
        provider: "job_boards",
        status: "connected",
        config: { boards: nextBoards },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    )
    .select()
    .single();

  if (upsertError || !integrationRow) {
    return NextResponse.json({ error: "Could not save board" }, { status: 500 });
  }

  logKodaEvent(supabase, user.id, "job_board_added", { ats: candidate.ats });

  // Sync immediately so the board shows postings right away.
  const service = createServiceClient();
  const outcome = await runJobBoardsSync(service, integrationRow as Integration, "initial");

  return NextResponse.json({
    ok: true,
    board: candidate,
    synced: outcome.ok,
    stats: outcome.ok ? outcome.stats : undefined,
  });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let ats: string;
  let boardToken: string;
  try {
    const body = await request.json();
    ats = body.ats;
    boardToken = body.board_token;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if ((ats !== "greenhouse" && ats !== "lever") || !boardToken) {
    return NextResponse.json({ error: "Invalid board" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "job_boards")
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Not connected" }, { status: 404 });
  }

  const boards: JobBoardConfig[] = existing.config?.boards ?? [];
  const nextBoards = boards.filter((b) => !(b.ats === ats && b.board_token === boardToken));
  if (nextBoards.length === boards.length) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }

  // Delete this board's imported postings (user client: RLS-scoped), then
  // shrink or remove the integration.
  await supabase
    .from("external_opportunities")
    .delete()
    .eq("user_id", user.id)
    .eq("provider", ats)
    .eq("board_token", boardToken);

  if (nextBoards.length === 0) {
    const { error } = await supabase.from("integrations").delete().eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: "Could not remove board" }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("integrations")
      .update({ config: { boards: nextBoards }, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: "Could not remove board" }, { status: 500 });
    }
  }

  logKodaEvent(supabase, user.id, "job_board_removed", { ats });
  return NextResponse.json({ ok: true });
}
