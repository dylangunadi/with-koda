import type { NormalizedOpportunity, OpportunityPullResult, OpportunitySource } from "../types";

/**
 * Greenhouse public board adapter. No authentication: these are the same
 * listings anyone sees at boards.greenhouse.io/{token}. Defensive parsing —
 * upstream shape drift degrades to a failed sync run, never a crash.
 */

const FETCH_TIMEOUT_MS = 10_000;

interface GreenhouseJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  updated_at?: string;
  first_published?: string;
  location?: { name?: string };
  departments?: { name?: string }[];
}

export function normalizeGreenhouseJob(
  job: GreenhouseJob,
  company: string
): NormalizedOpportunity | null {
  if (job.id === undefined || job.id === null || !job.title || !job.absolute_url) return null;
  return {
    external_id: String(job.id),
    company,
    title: job.title,
    location: job.location?.name ?? null,
    department: job.departments?.[0]?.name ?? null,
    absolute_url: job.absolute_url,
    source_posted_at: job.first_published ?? null,
    source_updated_at: job.updated_at ?? null,
  };
}

export const greenhouseSource: OpportunitySource = {
  async pullPostings(board): Promise<OpportunityPullResult> {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.boardToken)}/jobs`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Greenhouse board fetch failed (${res.status})`);
    }
    const data = await res.json();
    const jobs: GreenhouseJob[] = Array.isArray(data?.jobs) ? data.jobs : [];
    const postings = jobs
      .map((job) => normalizeGreenhouseJob(job, board.company))
      .filter((p): p is NormalizedOpportunity => p !== null);
    return { postings, fetchedAt: new Date().toISOString() };
  },
};
