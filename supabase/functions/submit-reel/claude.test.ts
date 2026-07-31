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

// OpenRouter serves the same model from multiple providers, and not every
// provider honours json_schema — without `require_parameters` OpenRouter may
// silently route to one that downgrades to json_object, breaking the strict
// contract the schema (and the score-range check in handler.ts) relies on.
Deno.test("analyzeReel pins the model and forces a structured-output-capable route", async () => {
  let captured: Record<string, unknown> | undefined;
  const fakeClient = {
    chat: {
      completions: {
        create: (params: unknown) => {
          captured = params as Record<string, unknown>;
          return Promise.resolve({ choices: [{ message: { content: "{}" } }] });
        },
      },
    },
  };
  await analyzeReel("https://instagram.com/reel/abc", "caption", fakeClient);
  assertEquals(captured?.model, "openai/gpt-5-nano");
  assertEquals((captured?.provider as { require_parameters?: boolean })?.require_parameters, true);
  assertEquals((captured?.response_format as { type?: string })?.type, "json_schema");
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
