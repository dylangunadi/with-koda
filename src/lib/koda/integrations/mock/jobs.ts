import type { NormalizedOpportunity, OpportunityPullResult, OpportunitySource } from "../types";

/**
 * Deterministic offline job board for tests and keyless development. Returns
 * two stable postings per board so dedup/idempotency specs can assert exact
 * counts. Postings link to example.com, never to a real ATS.
 */
function buildPostings(boardToken: string, company: string): NormalizedOpportunity[] {
  return [
    {
      external_id: `mock-${boardToken}-apm`,
      company,
      title: "Associate Product Manager, New Grad",
      location: "San Francisco, CA",
      department: "Product",
      absolute_url: `https://example.com/boards/${boardToken}/jobs/apm`,
      source_posted_at: null,
      source_updated_at: null,
    },
    {
      external_id: `mock-${boardToken}-intern`,
      company,
      title: "Product Management Intern",
      location: "Remote",
      department: "Product",
      absolute_url: `https://example.com/boards/${boardToken}/jobs/intern`,
      source_posted_at: null,
      source_updated_at: null,
    },
  ];
}

export const mockOpportunitySource: OpportunitySource = {
  async pullPostings(board): Promise<OpportunityPullResult> {
    return {
      postings: buildPostings(board.boardToken, board.company),
      fetchedAt: new Date().toISOString(),
    };
  },
};
