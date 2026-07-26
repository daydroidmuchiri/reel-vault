import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { analyzeReel, buildReelPrompt } from "./claude.ts";

Deno.test("buildReelPrompt includes the URL and caption when present", () => {
  const prompt = buildReelPrompt("https://instagram.com/reel/abc", "5 tools every founder needs");
  assertStringIncludes(prompt, "https://instagram.com/reel/abc");
  assertStringIncludes(prompt, "5 tools every founder needs");
});

Deno.test("buildReelPrompt notes the missing caption when null", () => {
  const prompt = buildReelPrompt("https://instagram.com/reel/abc", null);
  assertStringIncludes(prompt, "No caption is available");
});

Deno.test("analyzeReel parses the JSON text block from the Claude response", async () => {
  const analysis = {
    summary: "A tool roundup reel.",
    category: "tool",
    viability: {
      market_demand: "n/a",
      competition: "n/a",
      feasibility: "n/a",
      cost_to_launch: "n/a",
      score: 3,
      reasoning: "not a business idea",
    },
    tools_mentioned: [{ name: "CapCut", category: "video-editing", note: "free mobile editor" }],
  };
  const fakeClient = {
    messages: {
      create: async () => ({ content: [{ type: "text", text: JSON.stringify(analysis) }] }),
    },
  };
  const result = await analyzeReel("https://instagram.com/reel/abc", "caption", fakeClient);
  assertEquals(result, analysis);
});

Deno.test("analyzeReel throws when the response has no text block", async () => {
  const fakeClient = { messages: { create: async () => ({ content: [] }) } };
  await assertRejects(() => analyzeReel("https://instagram.com/reel/abc", null, fakeClient));
});
