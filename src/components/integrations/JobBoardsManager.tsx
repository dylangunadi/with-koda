"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Briefcase, Plus, X } from "lucide-react";
import type { Integration, JobBoardConfig } from "@/lib/types";

/**
 * Job board management. Honest framing: this only works for companies with
 * public Greenhouse or Lever boards; the paste-a-URL fallback covers the
 * rest. Suggestions come from the user's own target companies.
 */
export function JobBoardsManager({
  integration,
  targetCompanies,
}: {
  integration: Integration | null;
  targetCompanies: string[];
}) {
  const router = useRouter();
  const boards: JobBoardConfig[] = integration?.config.boards ?? [];
  const [company, setCompany] = useState("");
  const [boardUrl, setBoardUrl] = useState("");
  const [showUrlField, setShowUrlField] = useState(false);
  const [busy, setBusy] = useState(false);

  const suggestions = targetCompanies
    .filter(
      (c) => !boards.some((b) => b.company.trim().toLowerCase() === c.trim().toLowerCase())
    )
    .slice(0, 6);

  async function addBoard(companyName: string, url?: string) {
    if (!companyName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: companyName.trim(),
          ...(url?.trim() ? { board_url: url.trim() } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Could not add that board.");
        if (res.status === 404 && !url) setShowUrlField(true);
        return;
      }
      toast.success(`${companyName.trim()} board added`);
      setCompany("");
      setBoardUrl("");
      setShowUrlField(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeBoard(board: JobBoardConfig) {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/boards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ats: board.ats, board_token: board.board_token }),
      });
      if (!res.ok) {
        toast.error("Could not remove that board.");
        return;
      }
      toast.success(`${board.company} board removed and its imported roles deleted`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="font-system text-primary mb-3">Job boards</p>
      <div className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted">
            <Briefcase className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {boards.length > 0
                ? `Watching ${boards.length} ${boards.length === 1 ? "board" : "boards"}`
                : "No boards yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Koda checks the official public job board of each company you add
              and only ever suggests roles it actually found there, with a link
              to the live posting. Works for companies with public Greenhouse or
              Lever boards.
            </p>
          </div>
        </div>

        {boards.length > 0 && (
          <ul className="space-y-2">
            {boards.map((board) => (
              <li
                key={`${board.ats}-${board.board_token}`}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{board.company}</p>
                  <a
                    href={board.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-system text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {board.ats === "greenhouse" ? "Greenhouse board" : "Lever board"} ↗
                  </a>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeBoard(board)}
                  disabled={busy}
                  aria-label={`Remove ${board.company} board`}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-2">
            <p className="font-system text-muted-foreground">From your target companies</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => addBoard(suggestion)}
                  disabled={busy}
                  className="rounded-lg"
                >
                  <Plus className="size-3.5" aria-hidden />
                  <span>{suggestion}</span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company name"
              aria-label="Company name"
              className="h-9 rounded-lg text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => addBoard(company, showUrlField ? boardUrl : undefined)}
              disabled={busy || !company.trim()}
              className="rounded-lg shrink-0"
            >
              {busy ? "Checking..." : "Add board"}
            </Button>
          </div>
          {showUrlField && (
            <Input
              value={boardUrl}
              onChange={(e) => setBoardUrl(e.target.value)}
              placeholder="Paste the board URL, like https://boards.greenhouse.io/company"
              aria-label="Board URL"
              className="h-9 rounded-lg text-sm"
            />
          )}
          {!showUrlField && (
            <button
              onClick={() => setShowUrlField(true)}
              className="font-system text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Have the board URL? Paste it instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
