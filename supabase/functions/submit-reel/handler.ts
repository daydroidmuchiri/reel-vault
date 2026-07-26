import { analyzeReel, type AnalysisClient, type ReelAnalysis } from "./claude.ts";
import { type ToolsRepo, upsertToolsForReel } from "./toolsRepo.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface ReelsRepo {
  insertReel(row: {
    url: string;
    caption: string | null;
    summary: string | null;
    category: string | null;
    viability_score: number | null;
    viability_reasoning: unknown | null;
    needs_review: boolean;
  }): Promise<{ id: string } & Record<string, unknown>>;
}

export interface HandlerDeps {
  expectedPasscode: string;
  fetchCaption: (url: string) => Promise<string | null>;
  analysisClient: AnalysisClient;
  reelsRepo: ReelsRepo;
  toolsRepo: ToolsRepo;
}

function isInstagramUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(^|\.)instagram\.com$/.test(parsed.hostname);
  } catch {
    return false;
  }
}

const VALID_SCORES = new Set([1, 2, 3, 4, 5]);

function hasValidScore(analysis: ReelAnalysis): boolean {
  return VALID_SCORES.has(analysis.viability.score);
}

export async function handleSubmitReel(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  let body: { url?: string; passcode?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (body.passcode !== deps.expectedPasscode) {
    return new Response(JSON.stringify({ error: "Invalid passcode" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const url = (body.url ?? "").trim();
  if (!url || !isInstagramUrl(url)) {
    return new Response(JSON.stringify({ error: "Provide a valid instagram.com reel URL" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // A manually-typed note is strictly more reliable than the auto-fetched
  // caption (Instagram's oEmbed endpoint no longer returns real captions —
  // see instagram.ts), so prefer it when present and skip the network call
  // entirely. `note ||` short-circuits before `fetchCaption` is invoked.
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const caption = note || (await deps.fetchCaption(url));

  let analysis: ReelAnalysis | null = null;
  let analysisError: Error | null = null;
  try {
    analysis = await analyzeReel(url, caption, deps.analysisClient);
    if (!hasValidScore(analysis)) {
      analysisError = new Error(
        `Model returned an out-of-range viability score: ${JSON.stringify(analysis.viability.score)}`,
      );
      analysis = null;
    }
  } catch (err) {
    analysisError = err as Error;
  }

  if (analysis) {
    // A caption-less analysis has no real grounding — the model was told
    // not to invent specifics, but that instruction isn't a guarantee, so
    // flag it for review unconditionally rather than trusting compliance.
    const reel = await deps.reelsRepo.insertReel({
      url,
      caption,
      summary: analysis.summary,
      category: analysis.category,
      viability_score: analysis.viability.score,
      viability_reasoning: analysis.viability,
      needs_review: caption === null,
    });
    let toolsWarning: string | undefined;
    try {
      await upsertToolsForReel(deps.toolsRepo, reel.id as string, analysis.tools_mentioned);
    } catch (err) {
      toolsWarning = `Reel saved, but tools could not be linked: ${(err as Error).message}`;
    }
    return new Response(JSON.stringify({ reel, ...(toolsWarning ? { warning: toolsWarning } : {}) }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Analysis call or parsing failed — save the reel anyway so nothing is
  // lost, flagged for manual review, per the design spec's
  // degrade-gracefully rule. insertReel here is NOT inside a try/catch:
  // if it throws, that's a real persistence failure and should propagate
  // rather than being silently swallowed.
  const reel = await deps.reelsRepo.insertReel({
    url,
    caption,
    summary: null,
    category: null,
    viability_score: null,
    viability_reasoning: null,
    needs_review: true,
  });
  return new Response(
    JSON.stringify({
      reel,
      warning: `Saved, but analysis failed: ${analysisError?.message ?? "unknown error"}`,
    }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}
