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

/**
 * Curated companies with public Greenhouse/Lever boards, tagged by the role
 * families they regularly hire for. Used to suggest boards aligned with the
 * student's target ROLES (not just their named companies). Every suggestion
 * is still validated with a live fetch at add time, so a stale entry
 * degrades to an honest "board did not respond", never fake data.
 */
export const CURATED_BOARDS: Array<{
  company: string;
  ats: "greenhouse" | "lever";
  board_token: string;
  roles: string[];
}> = [
  { company: "Stripe", ats: "greenhouse", board_token: "stripe", roles: ["product", "pm", "software", "engineer", "data", "finance"] },
  { company: "Notion", ats: "greenhouse", board_token: "notion", roles: ["product", "pm", "software", "engineer", "design", "marketing"] },
  { company: "Figma", ats: "greenhouse", board_token: "figma", roles: ["product", "pm", "software", "engineer", "design"] },
  { company: "Airtable", ats: "greenhouse", board_token: "airtable", roles: ["product", "pm", "software", "engineer"] },
  { company: "Databricks", ats: "greenhouse", board_token: "databricks", roles: ["software", "engineer", "data", "ml", "machine learning"] },
  { company: "Duolingo", ats: "greenhouse", board_token: "duolingo", roles: ["product", "pm", "software", "engineer", "design", "data"] },
  { company: "Robinhood", ats: "greenhouse", board_token: "robinhood", roles: ["product", "pm", "software", "engineer", "finance", "data"] },
  { company: "Coinbase", ats: "greenhouse", board_token: "coinbase", roles: ["product", "pm", "software", "engineer", "finance"] },
  { company: "Gusto", ats: "greenhouse", board_token: "gusto", roles: ["product", "pm", "software", "engineer"] },
  { company: "Brex", ats: "greenhouse", board_token: "brex", roles: ["product", "pm", "software", "engineer", "finance"] },
  { company: "Pinterest", ats: "greenhouse", board_token: "pinterest", roles: ["product", "pm", "software", "engineer", "data", "design"] },
  { company: "Lyft", ats: "greenhouse", board_token: "lyft", roles: ["product", "pm", "software", "engineer", "data"] },
  { company: "Ramp", ats: "lever", board_token: "ramp", roles: ["product", "pm", "software", "engineer", "finance", "data"] },
  { company: "Plaid", ats: "lever", board_token: "plaid", roles: ["product", "pm", "software", "engineer", "finance"] },
  { company: "Palantir", ats: "lever", board_token: "palantir", roles: ["software", "engineer", "data", "consulting", "strategy"] },
  { company: "Scale AI", ats: "lever", board_token: "scaleai", roles: ["product", "pm", "software", "engineer", "ml", "machine learning", "data"] },
];

export function boardUrlFor(entry: { ats: "greenhouse" | "lever"; board_token: string }): string {
  return entry.ats === "greenhouse"
    ? `https://boards.greenhouse.io/${entry.board_token}`
    : `https://jobs.lever.co/${entry.board_token}`;
}

/** Companies from the curated catalog whose role tags overlap the student's
 * target roles, excluding companies already covered. */
export function suggestBoardsForRoles(
  targetRoles: string[],
  excludeCompanies: Set<string>,
  limit = 6
): Array<{ company: string; url: string }> {
  const roleText = targetRoles.join(" ").toLowerCase();
  if (!roleText.trim()) return [];
  return CURATED_BOARDS.filter(
    (entry) =>
      !excludeCompanies.has(entry.company.toLowerCase()) &&
      entry.roles.some((tag) => roleText.includes(tag))
  )
    .slice(0, limit)
    .map((entry) => ({ company: entry.company, url: boardUrlFor(entry) }));
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
