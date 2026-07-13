import type { NormalizedOpportunity, OpportunityPullResult, OpportunitySource } from "../types";

/**
 * Lever public postings adapter. No authentication: same listings anyone
 * sees at jobs.lever.co/{token}. Defensive parsing — upstream shape drift
 * degrades to a failed sync run, never a crash.
 */

const FETCH_TIMEOUT_MS = 10_000;

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  categories?: { location?: string; team?: string; department?: string };
}

export function normalizeLeverPosting(
  posting: LeverPosting,
  company: string
): NormalizedOpportunity | null {
  if (!posting.id || !posting.text || !posting.hostedUrl) return null;
  return {
    external_id: posting.id,
    company,
    title: posting.text,
    location: posting.categories?.location ?? null,
    department: posting.categories?.team ?? posting.categories?.department ?? null,
    absolute_url: posting.hostedUrl,
    source_posted_at:
      typeof posting.createdAt === "number" ? new Date(posting.createdAt).toISOString() : null,
    source_updated_at: null,
  };
}

export const leverSource: OpportunitySource = {
  async pullPostings(board): Promise<OpportunityPullResult> {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board.boardToken)}?mode=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`Lever board fetch failed (${res.status})`);
    }
    const data = await res.json();
    const postings = (Array.isArray(data) ? (data as LeverPosting[]) : [])
      .map((posting) => normalizeLeverPosting(posting, board.company))
      .filter((p): p is NormalizedOpportunity => p !== null);
    return { postings, fetchedAt: new Date().toISOString() };
  },
};
