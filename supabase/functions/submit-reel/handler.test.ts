import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CORS_HEADERS, handleSubmitReel, type HandlerDeps, type ReelsRepo } from "./handler.ts";
import type { Tool, ToolsRepo } from "./toolsRepo.ts";

function fakeAnalysisResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
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
            ...overrides,
          }),
        },
      },
    ],
  };
}

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
    analysisClient: {
      chat: {
        completions: {
          create: async () => fakeAnalysisResponse(),
        },
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

Deno.test("handles a CORS preflight OPTIONS request with a 204 and CORS headers", async () => {
  const res = await handleSubmitReel(
    new Request("http://localhost/submit-reel", { method: "OPTIONS" }),
    makeDeps(),
  );
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), CORS_HEADERS["Access-Control-Allow-Origin"]);
  assertEquals(res.headers.get("Access-Control-Allow-Headers"), CORS_HEADERS["Access-Control-Allow-Headers"]);
  assertEquals(res.headers.get("Access-Control-Allow-Methods"), CORS_HEADERS["Access-Control-Allow-Methods"]);
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
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), CORS_HEADERS["Access-Control-Allow-Origin"]);
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json();
  assertEquals(body.reel.summary, "Summary");
  assertEquals(body.reel.needs_review, false);
});

Deno.test("saves the reel flagged for review when analysis fails", async () => {
  const deps = makeDeps({
    analysisClient: {
      chat: {
        completions: {
          create: async () => {
            throw new Error("api down");
          },
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

Deno.test("saves the reel flagged for review when the model returns an out-of-range score", async () => {
  const deps = makeDeps({
    analysisClient: {
      chat: {
        completions: {
          create: async () => fakeAnalysisResponse({ viability: {
            market_demand: "n/a",
            competition: "n/a",
            feasibility: "n/a",
            cost_to_launch: "n/a",
            score: 7,
            reasoning: "n/a",
          } }),
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
  assertEquals(body.reel.category, null);
  assertEquals(body.reel.viability_score, null);
  assertEquals(body.reel.viability_reasoning, null);
});

Deno.test("still saves the reel when the caption fetch returns null, but flags it for review", async () => {
  const deps = makeDeps({ fetchCaption: async () => null });
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reel.caption, null);
  assertEquals(body.reel.summary, "Summary");
  // No caption means no real grounding for the analysis — always flag for
  // review, even though the model returned a well-formed response.
  assertEquals(body.reel.needs_review, true);
});

Deno.test("stores no viability score when there is no caption to ground it", async () => {
  const deps = makeDeps({ fetchCaption: async () => null });
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  // With no caption the prompt tells the model to emit a neutral placeholder
  // score (see buildReelPrompt) — that number is filler, not an assessment,
  // so it must not be persisted and rendered as if it were a real score.
  assertEquals(body.reel.viability_score, null);
  assertEquals(body.reel.viability_reasoning, null);
});

Deno.test("uses a manually-provided note in place of the auto-fetched caption, and skips the fetch", async () => {
  let fetchCaptionCalls = 0;
  const deps = makeDeps({
    fetchCaption: async () => {
      fetchCaptionCalls++;
      return null;
    },
  });
  const res = await handleSubmitReel(
    jsonRequest({
      url: "https://www.instagram.com/reel/abc",
      passcode: "1234",
      note: "5 tools every founder needs",
    }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reel.caption, "5 tools every founder needs");
  // A real note grounds the analysis just like a real caption would —
  // it should NOT be forced into needs_review.
  assertEquals(body.reel.needs_review, false);
  assertEquals(fetchCaptionCalls, 0);
});

Deno.test("falls back to the auto-fetched caption when note is blank or whitespace-only", async () => {
  let fetchCaptionCalls = 0;
  const deps = makeDeps({
    fetchCaption: async () => {
      fetchCaptionCalls++;
      return "auto-fetched caption";
    },
  });
  const res = await handleSubmitReel(
    jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234", note: "   " }),
    deps,
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.reel.caption, "auto-fetched caption");
  assertEquals(fetchCaptionCalls, 1);
});

Deno.test("still returns 200 with a warning when linking tools fails after a successful save", async () => {
  let insertReelCalls = 0;
  const deps = makeDeps({
    reelsRepo: {
      async insertReel(row) {
        insertReelCalls++;
        return { id: "reel-1", ...row };
      },
    },
    toolsRepo: {
      async findToolByName() {
        return null;
      },
      async createTool(input) {
        return { id: "tool-1", ...input } as Tool;
      },
      async linkReelTool() {
        throw new Error("tools table unavailable");
      },
    },
    analysisClient: {
      chat: {
        completions: {
          create: async () =>
            fakeAnalysisResponse({ tools_mentioned: [{ name: "CapCut", category: "video-editing", note: "" }] }),
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
  assertEquals(body.reel.id, "reel-1");
  assertEquals(insertReelCalls, 1);
  assertEquals(typeof body.warning, "string");
  assertEquals(body.warning.includes("tools could not be linked"), true);
});

Deno.test("propagates errors when insertReel fails after successful analysis", async () => {
  const deps = makeDeps({
    reelsRepo: {
      async insertReel() {
        throw new Error("database connection failed");
      },
    },
  });
  await assertRejects(
    () => handleSubmitReel(
      jsonRequest({ url: "https://www.instagram.com/reel/abc", passcode: "1234" }),
      deps,
    ),
    Error,
    "database connection failed",
  );
});
