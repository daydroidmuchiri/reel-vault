import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleSubmitReel, type HandlerDeps, type ReelsRepo } from "./handler.ts";
import type { Tool, ToolsRepo } from "./toolsRepo.ts";

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const insertedReels: Array<Record<string, unknown>> = [];
  const reelsRepo: ReelsRepo = {
    async insertReel(row) {
      const reel = { id: `reel-${insertedReels.length + 1}`, ...row };
      insertedReels.push(reel);
      return reel;
    },
  };
  const toolsRepo: ToolsRepo = {
    async findToolByName() {
      return null;
    },
    async createTool(input) {
      return { id: "tool-1", ...input } as Tool;
    },
    async linkReelTool() {},
  };
  return {
    expectedPasscode: "1234",
    fetchCaption: async () => "a caption",
    claudeClient: {
      messages: {
        create: async () => ({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                summary: "Summary",
                category: "tool",
                viability: {
                  market_demand: "n/a",
                  competition: "n/a",
                  feasibility: "n/a",
                  cost_to_launch: "n/a",
                  score: 3,
                  reasoning: "n/a",
                },
                tools_mentioned: [],
              }),
            },
          ],
        }),
      },
    },
    reelsRepo,
    toolsRepo,
    ...overrides,
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/submit-reel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("rejects non-POST requests", async () => {
  const res = await handleSubmitReel(new Request("http://localhost/submit-reel"), makeDeps());
  assertEquals(res.status, 405);
});

Deno.test("rejects an invalid passcode", async () => {
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "wrong" }),
    makeDeps(),
  );
  assertEquals(res.status, 401);
});

Deno.test("rejects a non-Instagram URL", async () => {
  const res = await handleSubmitReel(jsonRequest({ url: "https://example.com", passcode: "1234" }), makeDeps());
  assertEquals(res.status, 400);
});

Deno.test("saves the reel with summary and score on success", async () => {
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
    makeDeps(),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reel.summary, "Summary");
  assertEquals(body.reel.needs_review, false);
});

Deno.test("saves the reel flagged for review when Claude analysis fails", async () => {
  const deps = makeDeps({
    claudeClient: {
      messages: {
        create: async () => {
          throw new Error("api down");
        },
      },
    },
  });
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reel.needs_review, true);
  assertEquals(body.reel.summary, null);
});

Deno.test("still saves the reel when the caption fetch returns null", async () => {
  const deps = makeDeps({ fetchCaption: async () => null });
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
    deps,
  );
  const body = await res.json();
  assertEquals(body.reel.caption, null);
  assertEquals(body.reel.summary, "Summary");
});
