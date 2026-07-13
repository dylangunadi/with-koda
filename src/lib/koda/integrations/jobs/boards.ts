import { getOpportunitySource } from "../registry";
import type { JobBoardConfig } from "@/lib/types";

/**
 * Board discovery: guess a public board token from a company name, or parse
 * one from a pasted board URL. Every candidate is validated with one live
 * fetch before it is saved — Koda never claims a board exists without
 * having seen it respond.
 */

export function slugifyCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/** Parse a pasted Greenhouse/Lever board URL into a config candidate. */
export function parseBoardUrl(rawUrl: string, company: string): JobBoardConfig | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const firstSegment = url.pathname.split("/").filter(Boolean)[0];
  if (!firstSegment) return null;

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    // Embedded boards use /embed/job_board?for=token
    const token =
      firstSegment === "embed" ? url.searchParams.get("for") ?? "" : firstSegment;
    if (!token) return null;
    return {
      company,
      ats: "greenhouse",
      board_token: token,
      url: `https://boards.greenhouse.io/${token}`,
    };
  }
  if (host === "jobs.lever.co") {
    return {
      company,
      ats: "lever",
      board_token: firstSegment,
      url: `https://jobs.lever.co/${firstSegment}`,
    };
  }
  return null;
}

/** One live fetch to confirm the board actually answers with postings data. */
export async function validateBoard(candidate: JobBoardConfig): Promise<boolean> {
  try {
    const source = await getOpportunitySource(candidate.ats);
    await source.pullPostings({ boardToken: candidate.board_token, company: candidate.company });
    return true;
  } catch {
    return false;
  }
}

/** Try the slug against Greenhouse then Lever. Honest fallback: null means
 * "no public Greenhouse or Lever board found", not "no jobs exist". */
export async function guessBoardForCompany(company: string): Promise<JobBoardConfig | null> {
  const token = slugifyCompany(company);
  if (!token) return null;

  const greenhouse: JobBoardConfig = {
    company,
    ats: "greenhouse",
    board_token: token,
    url: `https://boards.greenhouse.io/${token}`,
  };
  if (await validateBoard(greenhouse)) return greenhouse;

  const lever: JobBoardConfig = {
    company,
    ats: "lever",
    board_token: token,
    url: `https://jobs.lever.co/${token}`,
  };
  if (await validateBoard(lever)) return lever;

  return null;
}
