import { describe, it, expect } from "vitest";
import { renderReelCard, renderToolRow, filterTools } from "../src/render.js";

describe("renderReelCard", () => {
  const baseReel = {
    url: "https://www.instagram.com/reel/abc/",
    summary: "A tool roundup <script>alert(1)</script>",
    viability_score: 4,
    needs_review: false,
    created_at: "2026-07-26T09:00:00Z",
  };

  it("escapes HTML in the summary", () => {
    const html = renderReelCard(baseReel);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the viability score when present", () => {
    expect(renderReelCard(baseReel)).toContain("4/5");
  });

  it("falls back to a dash when there is no score", () => {
    expect(renderReelCard({ ...baseReel, viability_score: null })).toContain("Viability: —");
  });

  it("shows a needs-review badge only when needs_review is true", () => {
    expect(renderReelCard({ ...baseReel, needs_review: true })).toContain("Needs review");
    expect(renderReelCard(baseReel)).not.toContain("Needs review");
  });
});

describe("renderToolRow", () => {
  it("pluralizes the reel count correctly", () => {
    const one = renderToolRow({ name: "CapCut", category: "video-editing", note: "", reel_tools: [{ reel_id: "1" }] });
    const two = renderToolRow({ name: "CapCut", category: "video-editing", note: "", reel_tools: [{ reel_id: "1" }, { reel_id: "2" }] });
    expect(one).toContain("Seen in 1 reel");
    expect(two).toContain("Seen in 2 reels");
  });

  it("falls back to 'uncategorized' when category is missing", () => {
    expect(renderToolRow({ name: "CapCut", category: null, note: "", reel_tools: [] })).toContain("uncategorized");
  });
});

describe("filterTools", () => {
  const tools = [
    { name: "CapCut", category: "video-editing" },
    { name: "Runway", category: "ai-video" },
    { name: "Notion", category: "productivity" },
  ];

  it("matches by name, case-insensitively", () => {
    expect(filterTools(tools, "capcut")).toEqual([tools[0]]);
  });

  it("matches by category", () => {
    expect(filterTools(tools, "video")).toEqual([tools[0], tools[1]]);
  });

  it("returns everything for an empty or whitespace-only query", () => {
    expect(filterTools(tools, "")).toEqual(tools);
    expect(filterTools(tools, "   ")).toEqual(tools);
  });
});
