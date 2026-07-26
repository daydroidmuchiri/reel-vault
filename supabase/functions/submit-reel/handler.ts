import { analyzeReel, type ClaudeClient } from "./claude.ts";
import { type ToolsRepo, upsertToolsForReel } from "./toolsRepo.ts";

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
  claudeClient: ClaudeClient;
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

export async function handleSubmitReel(request: Request, deps: HandlerDeps): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  let body: { url?: string; passcode?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (body.passcode !== deps.expectedPasscode) {
    return new Response(JSON.stringify({ error: "Invalid passcode" }), { status: 401 });
  }

  const url = (body.url ?? "").trim();
  if (!url || !isInstagramUrl(url)) {
    return new Response(JSON.stringify({ error: "Provide a valid instagram.com reel URL" }), { status: 400 });
  }

  const caption = await deps.fetchCaption(url);

  try {
    const analysis = await analyzeReel(url, caption, deps.claudeClient);
    const reel = await deps.reelsRepo.insertReel({
      url,
      caption,
      summary: analysis.summary,
      category: analysis.category,
      viability_score: analysis.viability.score,
      viability_reasoning: analysis.viability,
      needs_review: false,
    });
    await upsertToolsForReel(deps.toolsRepo, reel.id as string, analysis.tools_mentioned);
    return new Response(JSON.stringify({ reel }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Claude call or parsing failed — save the reel anyway so nothing is
    // lost, flagged for manual review, per the design spec's
    // degrade-gracefully rule.
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
      JSON.stringify({ reel, warning: `Saved, but analysis failed: ${(err as Error).message}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
}
