import OpenAI from "npm:openai@^6.49.0";

export interface ReelAnalysis {
  summary: string;
  category: "business-idea" | "tool" | "other";
  viability: {
    market_demand: string;
    competition: string;
    feasibility: string;
    cost_to_launch: string;
    score: number;
    reasoning: string;
  };
  tools_mentioned: Array<{ name: string; category: string; note: string }>;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    category: { type: "string", enum: ["business-idea", "tool", "other"] },
    viability: {
      type: "object",
      properties: {
        market_demand: { type: "string" },
        competition: { type: "string" },
        feasibility: { type: "string" },
        cost_to_launch: { type: "string" },
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        reasoning: { type: "string" },
      },
      required: ["market_demand", "competition", "feasibility", "cost_to_launch", "score", "reasoning"],
      additionalProperties: false,
    },
    tools_mentioned: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "category", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "category", "viability", "tools_mentioned"],
  additionalProperties: false,
};

export function buildReelPrompt(url: string, caption: string | null): string {
  const captionSection = caption
    ? `Caption: """${caption}"""`
    : "No caption is available for this reel, and you have no other way to " +
      "know what it actually shows. Do NOT invent or guess specific plot " +
      "details, products, businesses, or scenarios — you have no basis for " +
      "them. State plainly in the summary that the content couldn't be " +
      'determined without a caption. Set category to "other" unless the URL ' +
      "itself makes the type obvious (it usually doesn't), and fill the " +
      "viability fields with a neutral placeholder (e.g. score 3, reasoning " +
      "noting there was nothing to evaluate).";
  return [
    "You are evaluating an Instagram reel that was saved because it's a " +
      "business idea, a tool recommendation, or something else worth remembering.",
    `Reel URL: ${url}`,
    captionSection,
    "",
    'Summarize what the reel is about in 1-3 sentences. Classify it as ' +
      '"business-idea", "tool", or "other".',
    "If it's a business idea, evaluate its viability using a standard " +
      "startup lens: market demand, competition/differentiation, feasibility " +
      "for a solo or small-team builder, and rough cost/effort to launch. " +
      "Give an overall score from 1 (weak) to 5 (strong) with your reasoning. " +
      "If it's not a business idea, still fill in the viability fields with " +
      "your best-effort read (e.g. score 3, reasoning explaining it's not " +
      "applicable) rather than leaving them empty.",
    'List every tool, app, or piece of software mentioned or shown, with a ' +
      'short category (e.g. "video-editing", "no-code", "ai-video") and a ' +
      "one-line note. Leave category/note as an empty string if genuinely " +
      "unknown. If no tools are mentioned, return an empty array.",
  ].join("\n");
}

// OpenRouter (https://openrouter.ai) fronts many model families behind one
// OpenAI-compatible Chat Completions API — this interface is intentionally
// just the slice of the OpenAI SDK's shape that analyzeReel needs, so tests
// can supply a fake without touching the network.
//
// Provider history: Claude API -> GitHub Models -> OpenRouter. GitHub Models
// was fully retired on 2026-07-30, which broke analysis outright; OpenRouter
// is the replacement. The module is still named claude.ts for import
// stability across those swaps — it has not called the Claude API since
// commit 08f5274.
export interface AnalysisClient {
  chat: {
    completions: {
      create: (params: unknown) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
}

export async function analyzeReel(
  url: string,
  caption: string | null,
  client: AnalysisClient,
): Promise<ReelAnalysis> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: buildReelPrompt(url, caption) }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "reel_analysis", strict: true, schema: RESPONSE_SCHEMA },
    },
    // Only route to providers that actually implement json_schema. Without
    // this OpenRouter may fall back to a provider that downgrades to
    // json_object, which would return unvalidated shapes.
    provider: { require_parameters: true },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model response contained no content");
  }
  return JSON.parse(content) as ReelAnalysis;
}

// Free tier ($0 in/out), 262k context, served first-party by Nvidia, and the
// most capable of the handful of free models whose endpoints actually
// implement json_schema. Verify any replacement is still free AND
// structured-output-capable at the *endpoint* level before swapping — the
// model-level flag lies (see docs/supabase-setup.md):
//   https://openrouter.ai/api/v1/models/<id>/endpoints
export const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export function createModelClient(apiKey: string): AnalysisClient {
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  }) as unknown as AnalysisClient;
}
