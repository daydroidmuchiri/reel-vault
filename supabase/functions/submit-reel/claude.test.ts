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

Deno.test("buildReelPrompt instructs against fabricating details when caption is null", () => {
  const prompt = buildReelPrompt("https://instagram.com/reel/abc", null);
  assertStringIncludes(prompt, "Do NOT invent or guess specific plot details");
});

Deno.test("analyzeReel parses the JSON content from the model response", async () => {
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
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: JSON.stringify(analysis) } }] }),
      },
    },
  };
  const result = await analyzeReel("https://instagram.com/reel/abc", "caption", fakeClient);
  assertEquals(result, analysis);
});

Deno.test("analyzeReel throws when the response has no content", async () => {
  const fakeClient = { chat: { completions: { create: async () => ({ choices: [{ message: { content: null } }] }) } } };
  await assertRejects(() => analyzeReel("https://instagram.com/reel/abc", null, fakeClient));
});

Deno.test("analyzeReel throws when the response has no choices at all", async () => {
  const fakeClient = { chat: { completions: { create: async () => ({ choices: [] }) } } };
  await assertRejects(() => analyzeReel("https://instagram.com/reel/abc", null, fakeClient));
});
