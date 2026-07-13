import { describe, expect, it } from "vitest";
import { parseBoardUrl, slugifyCompany } from "../jobs/boards";

describe("slugifyCompany", () => {
  it("lowercases and strips punctuation", () => {
    expect(slugifyCompany("Notion")).toBe("notion");
    expect(slugifyCompany("O'Reilly Media")).toBe("oreillymedia");
    expect(slugifyCompany("Bain & Company")).toBe("bainandcompany");
    expect(slugifyCompany("  ")).toBe("");
  });
});

describe("parseBoardUrl", () => {
  it("parses a Greenhouse board URL", () => {
    const board = parseBoardUrl("https://boards.greenhouse.io/notion", "Notion");
    expect(board).toEqual({
      company: "Notion",
      ats: "greenhouse",
      board_token: "notion",
      url: "https://boards.greenhouse.io/notion",
    });
  });

  it("parses an embedded Greenhouse board URL", () => {
    const board = parseBoardUrl(
      "https://boards.greenhouse.io/embed/job_board?for=acme",
      "Acme"
    );
    expect(board?.board_token).toBe("acme");
  });

  it("parses a Lever board URL", () => {
    const board = parseBoardUrl("https://jobs.lever.co/ramp/some-posting", "Ramp");
    expect(board).toEqual({
      company: "Ramp",
      ats: "lever",
      board_token: "ramp",
      url: "https://jobs.lever.co/ramp",
    });
  });

  it("rejects non-board and malformed URLs", () => {
    expect(parseBoardUrl("https://example.com/careers", "X")).toBeNull();
    expect(parseBoardUrl("not a url", "X")).toBeNull();
    expect(parseBoardUrl("https://boards.greenhouse.io/", "X")).toBeNull();
  });
});
