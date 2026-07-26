import Anthropic from "npm:@anthropic-ai/sdk";

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
        score: { type: "integer" },
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
    : "No caption is available for this reel — work from the URL and general " +
      "knowledge of what kind of content circulates on Instagram reels, and " +
      "note the reduced confidence in your summary.";
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

export interface ClaudeClient {
  messages: {
    create: (params: unknown) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export async function analyzeReel(
  url: string,
  caption: string | null,
  client: ClaudeClient,
): Promise<ReelAnalysis> {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
    messages: [{ role: "user", content: buildReelPrompt(url, caption) }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new Error("Claude response contained no text block");
  }
  return JSON.parse(textBlock.text) as ReelAnalysis;
}

export function createAnthropicClient(apiKey: string): ClaudeClient {
  return new Anthropic({ apiKey }) as unknown as ClaudeClient;
}
