# Reel Vault MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase-1 Reel Vault app — a passcode-gated PWA where Daniel pastes an Instagram reel URL and gets back a Claude-generated summary, business-viability score, and a searchable tools catalog extracted across all saved reels.

**Architecture:** A static Vite frontend (vanilla JS, no framework — matches the `video-to-food` project's style) talks directly to Supabase PostgREST for reads and to a single Supabase Edge Function (`submit-reel`, Deno/TypeScript) for writes. The edge function is the only thing that touches secrets: it validates a passcode, fetches the reel's public caption, calls the Claude API for structured analysis, and writes to Postgres using the service-role key (bypassing RLS). All business logic (prompt building, response parsing, tool upsert matching) is written as pure, dependency-injected functions so it can be unit tested without a live Supabase project or a real Claude API key.

**Tech Stack:** Vite 6 + Vitest 3 (frontend, vanilla JS, no UI framework), Supabase (Postgres + Row Level Security + Edge Functions), Deno (edge function runtime + `deno test`), `@anthropic-ai/sdk` via `npm:` specifier, `@supabase/supabase-js` via `npm:` specifier (edge function only — the frontend uses raw `fetch` against PostgREST, no SDK).

## Global Constraints

- Claude model: `claude-opus-5` (house default) for every reel analysis call.
- Structured output via `output_config.format` (`json_schema`) — never rely on free-text parsing of the model's response.
- Frontend has zero npm dependencies beyond `vite` and `vitest` — no Supabase JS SDK client-side; use raw `fetch` against PostgREST, matching `video-to-food/smoke-test`'s established pattern.
- All writes (reels, tools, reel_tools) go through the `submit-reel` edge function using the Supabase service-role key. RLS on all three tables permits only `select` to `anon` — there are no anon insert/update policies.
- The passcode gate is UI-level only (hides the app until a value is entered in `localStorage`) plus a server-side check in the edge function before any paid Claude call is made. It is **not** a full auth boundary — reads remain reachable via the anon key if someone has it. This is an accepted tradeoff for a single-user personal tool (per the design spec).
- If the Instagram oEmbed caption fetch fails or returns nothing, save the reel anyway and analyze from the URL alone (never block or drop the submission).
- If the Claude call fails or returns unparseable output, save the reel with `needs_review = true` and null analysis fields, rather than losing the submission.
- Requires Node.js + npm (frontend) and Deno 1.40+ (edge function + its tests) installed locally. The first `deno test` run needs network access once to cache `npm:@anthropic-ai/sdk` and `npm:@supabase/supabase-js`.
- No live Supabase project is created as part of this plan — `supabase/schema.sql` and the edge function are written and unit-tested against fakes; wiring up a real project happens in the `docs/launch-checklist.md` manual steps (Task 13), matching `video-to-food`'s smoke-test pattern.

---

### Task 1: Frontend scaffolding + date formatting

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `src/style.css`
- Create: `src/format.js`
- Test: `tests/format.test.js`

**Interfaces:**
- Produces: `formatRelativeDate(isoString: string, now?: Date): string` — used by `src/render.js` in Task 11 to show reel timestamps.

- [ ] **Step 1: Write the failing test**

```js
// tests/format.test.js
import { describe, it, expect } from "vitest";
import { formatRelativeDate } from "../src/format.js";

describe("formatRelativeDate", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  it("returns 'Today' for the same day", () => {
    expect(formatRelativeDate("2026-07-26T09:00:00Z", now)).toBe("Today");
  });

  it("returns 'Yesterday' for exactly one day ago", () => {
    expect(formatRelativeDate("2026-07-25T09:00:00Z", now)).toBe("Yesterday");
  });

  it("returns 'N days ago' for 2-29 days ago", () => {
    expect(formatRelativeDate("2026-07-20T09:00:00Z", now)).toBe("6 days ago");
  });

  it("returns a formatted date for 30+ days ago", () => {
    expect(formatRelativeDate("2026-05-01T09:00:00Z", now)).toBe("May 1, 2026");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm install && npx vitest run tests/format.test.js`
Expected: FAIL — `Cannot find module '../src/format.js'` (npm install has nothing to install yet beyond devDependencies, but must run once vite/vitest are declared in package.json below).

- [ ] **Step 3: Create scaffolding files**

```json
// package.json
{
  "name": "reel-vault",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

```
node_modules/
dist/
```
(save as `.gitignore`)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reel Vault</title>
  <meta name="description" content="Save Instagram reels, get an instant business-viability read, and build a searchable tool catalog." />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <p>Reel Vault is loading…</p>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

(This shell body is replaced with the real UI in Task 12 — `main.js` doesn't exist yet, so `npm run dev` will show a blank/error page until then. That's expected at this point in the plan.)

```css
/* src/style.css */
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}
body { margin: 0; padding: 1rem; }
.card { max-width: 640px; margin: 0 auto; }
```

```js
// src/format.js
export function formatRelativeDate(isoString, now = new Date()) {
  const then = new Date(isoString);
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/format.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore index.html src/style.css src/format.js tests/format.test.js
git commit -m "Scaffold Vite frontend and add relative-date formatting"
```

---

### Task 2: Passcode gate (`src/auth.js`)

**Files:**
- Create: `src/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Produces: `getStoredPasscode(storage?): string | null`, `setStoredPasscode(passcode: string, storage?): void`, `clearStoredPasscode(storage?): void`, `isUnlocked(storage?): boolean` — consumed by `src/main.js` (Task 12) and `src/api.js` (Task 10).

- [ ] **Step 1: Write the failing test**

```js
// tests/auth.test.js
import { describe, it, expect } from "vitest";
import { getStoredPasscode, setStoredPasscode, clearStoredPasscode, isUnlocked } from "../src/auth.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

describe("auth", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredPasscode(fakeStorage())).toBeNull();
  });

  it("round-trips a stored passcode", () => {
    const storage = fakeStorage();
    setStoredPasscode("1234", storage);
    expect(getStoredPasscode(storage)).toBe("1234");
  });

  it("clears a stored passcode", () => {
    const storage = fakeStorage();
    setStoredPasscode("1234", storage);
    clearStoredPasscode(storage);
    expect(getStoredPasscode(storage)).toBeNull();
  });

  it("isUnlocked reflects whether a passcode is stored", () => {
    const storage = fakeStorage();
    expect(isUnlocked(storage)).toBe(false);
    setStoredPasscode("1234", storage);
    expect(isUnlocked(storage)).toBe(true);
  });

  it("treats a missing storage backend as locked, without throwing", () => {
    expect(() => isUnlocked(undefined)).not.toThrow();
    expect(isUnlocked(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth.test.js`
Expected: FAIL — `Cannot find module '../src/auth.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/auth.js
// UI-level gate only: hides the app until a value is entered. The real
// check happens server-side in the submit-reel edge function before any
// paid Claude call runs. See docs/superpowers/plans — Global Constraints.
const STORAGE_KEY = "reel-vault-passcode";

function resolveStorage(storage) {
  return storage ?? (typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null);
}

export function getStoredPasscode(storage) {
  const backend = resolveStorage(storage);
  return backend ? backend.getItem(STORAGE_KEY) : null;
}

export function setStoredPasscode(passcode, storage) {
  const backend = resolveStorage(storage);
  if (backend) backend.setItem(STORAGE_KEY, passcode);
}

export function clearStoredPasscode(storage) {
  const backend = resolveStorage(storage);
  if (backend) backend.removeItem(STORAGE_KEY);
}

export function isUnlocked(storage) {
  return Boolean(getStoredPasscode(storage));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/auth.js tests/auth.test.js
git commit -m "Add passcode gate storage helpers"
```

---

### Task 3: Supabase schema

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `public.reels`, `public.tools`, `public.reel_tools` — consumed by the edge function repos (Tasks 6-9) and the frontend's `src/api.js` (Task 10).

**Note on testing:** this task has no automated test — it's a SQL script applied manually to a live Supabase project (there is no local Postgres in this environment). Its correctness is verified by the review checklist below now, and by Daniel actually running it in `docs/launch-checklist.md` (Task 13).

- [ ] **Step 1: Write the schema**

```sql
-- supabase/schema.sql
-- Run once in the Supabase SQL editor.

create table public.reels (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  caption text,
  summary text,
  category text check (category in ('business-idea', 'tool', 'other')),
  viability_score int check (viability_score between 1 and 5),
  viability_reasoning jsonb,
  needs_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  note text,
  created_at timestamptz not null default now()
);

-- Case-insensitive uniqueness lets the edge function find-or-create tools
-- by name without worrying about "CapCut" vs "capcut" duplicating rows.
create unique index tools_name_lower_idx on public.tools (lower(name));

create table public.reel_tools (
  reel_id uuid not null references public.reels(id) on delete cascade,
  tool_id uuid not null references public.tools(id) on delete cascade,
  primary key (reel_id, tool_id)
);

alter table public.reels enable row level security;
alter table public.tools enable row level security;
alter table public.reel_tools enable row level security;

-- Reads are open (this is a personal tool gated by the app's passcode
-- screen, not by RLS). All writes go through the submit-reel edge function
-- using the service_role key, which bypasses RLS entirely — no anon
-- insert/update/delete policies exist on any of these tables.
create policy "reels are publicly readable" on public.reels
  for select to anon using (true);
create policy "tools are publicly readable" on public.tools
  for select to anon using (true);
create policy "reel_tools are publicly readable" on public.reel_tools
  for select to anon using (true);
```

- [ ] **Step 2: Review checklist (manual, no live DB in this environment)**

Confirm by reading the SQL:
- [ ] Every foreign key (`reel_tools.reel_id`, `reel_tools.tool_id`) references a table defined earlier in the file.
- [ ] `category` and `viability_score` checks match the values the Claude response schema in Task 5 will actually produce (`'business-idea' | 'tool' | 'other'`, `1..5`).
- [ ] RLS is enabled on all three tables and no `insert`/`update`/`delete` policy exists anywhere in the file.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "Add Supabase schema for reels, tools, and reel_tools"
```

---

### Task 4: Edge function — Instagram caption fetch

**Files:**
- Create: `supabase/functions/submit-reel/instagram.ts`
- Test: `supabase/functions/submit-reel/instagram.test.ts`

**Interfaces:**
- Produces: `fetchInstagramCaption(url: string, fetchImpl?: typeof fetch): Promise<string | null>` — consumed by `supabase/functions/submit-reel/index.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/submit-reel/instagram.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchInstagramCaption } from "./instagram.ts";

Deno.test("returns the title when the oEmbed call succeeds", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ title: "5 tools every founder needs" }), { status: 200 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, "5 tools every founder needs");
});

Deno.test("returns null when title is missing", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({}), { status: 200 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});

Deno.test("returns null on a non-2xx response", async () => {
  const fakeFetch = async () => new Response("not found", { status: 404 });
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});

Deno.test("returns null when the network call throws", async () => {
  const fakeFetch = async () => {
    throw new Error("offline");
  };
  const caption = await fetchInstagramCaption("https://www.instagram.com/reel/abc/", fakeFetch);
  assertEquals(caption, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/submit-reel/instagram.test.ts`
Expected: FAIL — module not found (`instagram.ts` doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/submit-reel/instagram.ts
// Fetches an Instagram reel's public caption via the oEmbed endpoint.
// Best-effort: Instagram's oEmbed response often omits captions entirely
// (it may return only author_name/html), so a null return is expected and
// handled gracefully by the caller — the reel is still saved and analyzed
// from the URL alone.
export async function fetchInstagramCaption(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetchImpl(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const caption = typeof data.title === "string" ? data.title.trim() : "";
    return caption.length > 0 ? caption : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/submit-reel/instagram.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-reel/instagram.ts supabase/functions/submit-reel/instagram.test.ts
git commit -m "Add Instagram oEmbed caption fetch with graceful fallback"
```

---

### Task 5: Edge function — Claude analysis

**Files:**
- Create: `supabase/functions/submit-reel/claude.ts`
- Test: `supabase/functions/submit-reel/claude.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildReelPrompt(url: string, caption: string | null): string`, `type ClaudeClient`, `type ReelAnalysis`, `analyzeReel(url: string, caption: string | null, client: ClaudeClient): Promise<ReelAnalysis>`, `createAnthropicClient(apiKey: string): ClaudeClient` — consumed by `handler.ts` (Task 8) and `index.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/submit-reel/claude.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/submit-reel/claude.test.ts`
Expected: FAIL — module not found (`claude.ts` doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/submit-reel/claude.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/submit-reel/claude.test.ts`
Expected: PASS (4 tests). First run downloads `npm:@anthropic-ai/sdk` — needs network access once.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-reel/claude.ts supabase/functions/submit-reel/claude.test.ts
git commit -m "Add Claude reel analysis: prompt builder and structured-output call"
```

---

### Task 6: Edge function — tools upsert logic

**Files:**
- Create: `supabase/functions/submit-reel/toolsRepo.ts`
- Test: `supabase/functions/submit-reel/toolsRepo.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `interface Tool { id, name, category: string | null, note: string | null }`, `interface ToolsRepo { findToolByName, createTool, linkReelTool }`, `upsertToolsForReel(repo: ToolsRepo, reelId: string, toolsMentioned: Array<{name,category,note}>): Promise<void>` — consumed by `supabaseToolsRepo.ts` (Task 7) and `handler.ts` (Task 8).

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/submit-reel/toolsRepo.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { type Tool, type ToolsRepo, upsertToolsForReel } from "./toolsRepo.ts";

function makeFakeRepo(): ToolsRepo & { tools: Tool[]; links: Array<[string, string]> } {
  const tools: Tool[] = [];
  const links: Array<[string, string]> = [];
  return {
    tools,
    links,
    async findToolByName(name) {
      return tools.find((t) => t.name.toLowerCase() === name.toLowerCase()) ?? null;
    },
    async createTool(input) {
      const tool: Tool = { id: `tool-${tools.length + 1}`, ...input };
      tools.push(tool);
      return tool;
    },
    async linkReelTool(reelId, toolId) {
      links.push([reelId, toolId]);
    },
  };
}

Deno.test("creates a new tool and links it to the reel", async () => {
  const repo = makeFakeRepo();
  await upsertToolsForReel(repo, "reel-1", [{ name: "CapCut", category: "video-editing", note: "free editor" }]);
  assertEquals(repo.tools.length, 1);
  assertEquals(repo.tools[0].name, "CapCut");
  assertEquals(repo.links, [["reel-1", repo.tools[0].id]]);
});

Deno.test("reuses an existing tool matched case-insensitively", async () => {
  const repo = makeFakeRepo();
  await repo.createTool({ name: "CapCut", category: "video-editing", note: "free editor" });
  await upsertToolsForReel(repo, "reel-2", [{ name: "capcut", category: "", note: "" }]);
  assertEquals(repo.tools.length, 1);
  assertEquals(repo.links, [["reel-2", repo.tools[0].id]]);
});

Deno.test("skips mentions with a blank name", async () => {
  const repo = makeFakeRepo();
  await upsertToolsForReel(repo, "reel-1", [{ name: "  ", category: "", note: "" }]);
  assertEquals(repo.tools.length, 0);
  assertEquals(repo.links.length, 0);
});

Deno.test("links multiple distinct tools from one reel", async () => {
  const repo = makeFakeRepo();
  await upsertToolsForReel(repo, "reel-1", [
    { name: "CapCut", category: "video-editing", note: "" },
    { name: "Runway", category: "ai-video", note: "" },
  ]);
  assertEquals(repo.tools.length, 2);
  assertEquals(repo.links.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/submit-reel/toolsRepo.test.ts`
Expected: FAIL — module not found (`toolsRepo.ts` doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/submit-reel/toolsRepo.ts
export interface Tool {
  id: string;
  name: string;
  category: string | null;
  note: string | null;
}

export interface ToolsRepo {
  findToolByName(name: string): Promise<Tool | null>;
  createTool(input: { name: string; category: string | null; note: string | null }): Promise<Tool>;
  linkReelTool(reelId: string, toolId: string): Promise<void>;
}

// Finds-or-creates each mentioned tool by case-insensitive name, then links
// it to the reel. Existing tools are never overwritten with a new
// category/note — the first reel to mention a tool "wins" its metadata.
export async function upsertToolsForReel(
  repo: ToolsRepo,
  reelId: string,
  toolsMentioned: Array<{ name: string; category: string; note: string }>,
): Promise<void> {
  for (const mention of toolsMentioned) {
    const name = mention.name.trim();
    if (!name) continue;
    let tool = await repo.findToolByName(name);
    if (!tool) {
      tool = await repo.createTool({
        name,
        category: mention.category.trim() || null,
        note: mention.note.trim() || null,
      });
    }
    await repo.linkReelTool(reelId, tool.id);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/submit-reel/toolsRepo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-reel/toolsRepo.ts supabase/functions/submit-reel/toolsRepo.test.ts
git commit -m "Add tool find-or-create-and-link logic"
```

---

### Task 7: Edge function — Supabase-backed tools repo

**Files:**
- Create: `supabase/functions/submit-reel/supabaseToolsRepo.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolsRepo` from `toolsRepo.ts` (Task 6).
- Produces: `createSupabaseToolsRepo(client: SupabaseClient): ToolsRepo` — consumed by `index.ts` (Task 9).

**Note on testing:** this is a thin adapter over the Supabase JS client with no branching logic of its own (`upsertToolsForReel`, already tested against the interface in Task 6, is what has the logic). It's verified via the manual end-to-end check in `docs/launch-checklist.md` (Task 13) against a real database, not by an automated test here.

- [ ] **Step 1: Write the implementation**

```ts
// supabase/functions/submit-reel/supabaseToolsRepo.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js";
import type { Tool, ToolsRepo } from "./toolsRepo.ts";

export function createSupabaseToolsRepo(client: SupabaseClient): ToolsRepo {
  return {
    async findToolByName(name) {
      const { data, error } = await client
        .from("tools")
        .select("id, name, category, note")
        .ilike("name", name)
        .maybeSingle();
      if (error) throw error;
      return data as Tool | null;
    },
    async createTool(input) {
      const { data, error } = await client
        .from("tools")
        .insert(input)
        .select("id, name, category, note")
        .single();
      if (error) throw error;
      return data as Tool;
    },
    async linkReelTool(reelId, toolId) {
      const { error } = await client.from("reel_tools").insert({ reel_id: reelId, tool_id: toolId });
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/submit-reel/supabaseToolsRepo.ts`
Expected: no type errors (this also confirms `Tool`/`ToolsRepo` from Task 6 line up with what this file consumes).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/submit-reel/supabaseToolsRepo.ts
git commit -m "Add Supabase-backed implementation of ToolsRepo"
```

---

### Task 8: Edge function — request handler

**Files:**
- Create: `supabase/functions/submit-reel/handler.ts`
- Test: `supabase/functions/submit-reel/handler.test.ts`

**Interfaces:**
- Consumes: `analyzeReel`, `ClaudeClient` from `claude.ts` (Task 5); `upsertToolsForReel`, `ToolsRepo` from `toolsRepo.ts` (Task 6).
- Produces: `interface ReelsRepo { insertReel }`, `interface HandlerDeps`, `handleSubmitReel(request: Request, deps: HandlerDeps): Promise<Response>` — consumed by `index.ts` (Task 9).

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/submit-reel/handler.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test supabase/functions/submit-reel/handler.test.ts`
Expected: FAIL — module not found (`handler.ts` doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/submit-reel/handler.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test supabase/functions/submit-reel/handler.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/submit-reel/handler.ts supabase/functions/submit-reel/handler.test.ts
git commit -m "Add submit-reel request handler with graceful-degradation paths"
```

---

### Task 9: Edge function — bootstrap wiring

**Files:**
- Create: `supabase/functions/submit-reel/index.ts`

**Interfaces:**
- Consumes: `fetchInstagramCaption` (Task 4), `createAnthropicClient` (Task 5), `createSupabaseToolsRepo` (Task 7), `handleSubmitReel`, `ReelsRepo` (Task 8).
- Produces: nothing consumed by other tasks — this is the deployment entry point.

**Note on testing:** this file only wires real dependencies (env vars, `Deno.serve`) into `handleSubmitReel`, which is already fully tested in Task 8. It's verified by running it locally (`supabase functions serve`) and by the manual end-to-end check in `docs/launch-checklist.md` (Task 13), not by an automated test here — `Deno.env.get(...)!` throwing outside a configured environment is expected and desired.

- [ ] **Step 1: Write the implementation**

```ts
// supabase/functions/submit-reel/index.ts
import { createClient } from "npm:@supabase/supabase-js";
import { fetchInstagramCaption } from "./instagram.ts";
import { createAnthropicClient } from "./claude.ts";
import { createSupabaseToolsRepo } from "./supabaseToolsRepo.ts";
import { handleSubmitReel, type ReelsRepo } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!;
const expectedPasscode = Deno.env.get("REEL_VAULT_PASSCODE")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const reelsRepo: ReelsRepo = {
  async insertReel(row) {
    const { data, error } = await supabase.from("reels").insert(row).select().single();
    if (error) throw error;
    return data;
  },
};

Deno.serve((request) =>
  handleSubmitReel(request, {
    expectedPasscode,
    fetchCaption: (url) => fetchInstagramCaption(url),
    claudeClient: createAnthropicClient(anthropicApiKey),
    reelsRepo,
    toolsRepo: createSupabaseToolsRepo(supabase),
  })
);
```

- [ ] **Step 2: Type-check**

Run: `deno check supabase/functions/submit-reel/index.ts`
Expected: no type errors

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/submit-reel/index.ts
git commit -m "Wire submit-reel edge function bootstrap"
```

---

### Task 10: Frontend — Supabase/edge-function client (`src/api.js`)

**Files:**
- Create: `src/config.js`
- Create: `src/api.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Consumes: `getStoredPasscode` from `src/auth.js` (Task 2).
- Produces: `fetchReels(): Promise<Array>`, `fetchTools(): Promise<Array>`, `submitReel(url: string): Promise<{ok: boolean, reel?, error?}>` — consumed by `src/main.js` (Task 12).

- [ ] **Step 1: Write the failing test**

```js
// tests/api.test.js
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReels, fetchTools, submitReel } from "../src/api.js";
import { CONFIG } from "../src/config.js";

describe("api", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("localStorage", {
      getItem: () => "1234",
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  it("fetchReels requests the reels table ordered newest-first", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ id: "1" }] });
    const reels = await fetchReels();
    expect(reels).toEqual([{ id: "1" }]);
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(`${CONFIG.supabaseUrl}/rest/v1/reels?select=*&order=created_at.desc`);
    expect(opts.headers.apikey).toBe(CONFIG.supabaseAnonKey);
  });

  it("fetchReels throws on a non-ok response", async () => {
    fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(fetchReels()).rejects.toThrow("Failed to load reels: 500");
  });

  it("fetchTools requests the tools table with linked reel ids", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await fetchTools();
    const [url] = fetch.mock.calls[0];
    expect(url).toBe(`${CONFIG.supabaseUrl}/rest/v1/tools?select=*,reel_tools(reel_id)&order=name.asc`);
  });

  it("submitReel posts the url and stored passcode, returns the reel on success", async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ reel: { id: "1" } }) });
    const result = await submitReel("https://www.instagram.com/reel/abc");
    expect(result).toEqual({ ok: true, reel: { id: "1" } });
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toBe(CONFIG.submitReelUrl);
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ url: "https://www.instagram.com/reel/abc", passcode: "1234" });
  });

  it("submitReel returns the server error message on failure", async () => {
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Invalid passcode" }) });
    const result = await submitReel("https://www.instagram.com/reel/abc");
    expect(result).toEqual({ ok: false, error: "Invalid passcode" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.test.js`
Expected: FAIL — `Cannot find module '../src/api.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/config.js
// Replace with real values from the Supabase project dashboard once it
// exists (Project Settings -> API) and the deployed edge function URL.
// See docs/launch-checklist.md.
export const CONFIG = {
  supabaseUrl: "https://REPLACE_WITH_PROJECT_REF.supabase.co",
  supabaseAnonKey: "REPLACE_WITH_ANON_KEY",
  submitReelUrl: "https://REPLACE_WITH_PROJECT_REF.supabase.co/functions/v1/submit-reel",
};
```

```js
// src/api.js
import { CONFIG } from "./config.js";
import { getStoredPasscode } from "./auth.js";

export async function fetchReels() {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/reels?select=*&order=created_at.desc`, {
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Failed to load reels: ${res.status}`);
  return res.json();
}

export async function fetchTools() {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/tools?select=*,reel_tools(reel_id)&order=name.asc`, {
    headers: { apikey: CONFIG.supabaseAnonKey, Authorization: `Bearer ${CONFIG.supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Failed to load tools: ${res.status}`);
  return res.json();
}

export async function submitReel(url) {
  const passcode = getStoredPasscode();
  const res = await fetch(CONFIG.submitReelUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, passcode }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body.error || `Request failed: ${res.status}` };
  }
  return { ok: true, reel: body.reel };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/api.js tests/api.test.js
git commit -m "Add frontend API client for reels, tools, and reel submission"
```

---

### Task 11: Frontend — rendering and filtering (`src/render.js`)

**Files:**
- Create: `src/render.js`
- Test: `tests/render.test.js`

**Interfaces:**
- Consumes: `formatRelativeDate` from `src/format.js` (Task 1).
- Produces: `renderReelCard(reel): string`, `renderToolRow(tool): string`, `filterTools(tools: Array, query: string): Array` — consumed by `src/main.js` (Task 12).

- [ ] **Step 1: Write the failing test**

```js
// tests/render.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render.test.js`
Expected: FAIL — `Cannot find module '../src/render.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/render.js
import { formatRelativeDate } from "./format.js";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function renderReelCard(reel) {
  const scoreLabel = reel.viability_score ? `${reel.viability_score}/5` : "—";
  const badge = reel.needs_review ? '<span class="badge badge-review">Needs review</span>' : "";
  const summary = reel.summary ? escapeHtml(reel.summary) : "No summary yet.";
  return `
    <article class="reel-card">
      <header>
        <a href="${escapeHtml(reel.url)}" target="_blank" rel="noopener">${escapeHtml(reel.url)}</a>
        ${badge}
      </header>
      <p class="summary">${summary}</p>
      <footer>
        <span class="score">Viability: ${scoreLabel}</span>
        <span class="date">${formatRelativeDate(reel.created_at)}</span>
      </footer>
    </article>
  `.trim();
}

export function renderToolRow(tool) {
  const category = tool.category ? escapeHtml(tool.category) : "uncategorized";
  const note = tool.note ? `<p class="tool-note">${escapeHtml(tool.note)}</p>` : "";
  const reelCount = Array.isArray(tool.reel_tools) ? tool.reel_tools.length : 0;
  return `
    <article class="tool-row">
      <h3>${escapeHtml(tool.name)} <span class="tool-category">${category}</span></h3>
      ${note}
      <p class="tool-source-count">Seen in ${reelCount} reel${reelCount === 1 ? "" : "s"}</p>
    </article>
  `.trim();
}

export function filterTools(tools, query) {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (t) => t.name.toLowerCase().includes(q) || (t.category && t.category.toLowerCase().includes(q)),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/render.js tests/render.test.js
git commit -m "Add reel/tool rendering and tool search filtering"
```

---

### Task 12: Frontend — app wiring, PWA shell

**Files:**
- Modify: `index.html`
- Create: `src/main.js`
- Modify: `src/style.css`
- Create: `public/manifest.webmanifest`
- Create: `public/icon.svg`

**Interfaces:**
- Consumes: `isUnlocked`, `setStoredPasscode` (Task 2); `fetchReels`, `fetchTools`, `submitReel` (Task 10); `renderReelCard`, `renderToolRow`, `filterTools` (Task 11).
- Produces: nothing consumed by other tasks — this is the app's UI entry point.

**Note on testing:** `main.js` is DOM-wiring glue with no branching logic of its own (all logic lives in the already-tested modules above), matching `video-to-food/smoke-test/src/main.js`, which is likewise untested directly. It's verified manually via `npm run dev` in Step 2 below.

- [ ] **Step 1: Write the implementation**

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reel Vault</title>
  <meta name="description" content="Save Instagram reels, get an instant business-viability read, and build a searchable tool catalog." />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <section id="passcode-screen" class="card">
    <h1>Reel Vault</h1>
    <form id="passcode-form">
      <label for="passcode-input">Enter passcode</label>
      <input id="passcode-input" type="password" inputmode="numeric" autocomplete="off" />
      <button type="submit">Unlock</button>
    </form>
  </section>

  <main id="app" class="card" hidden>
    <h1>Reel Vault</h1>

    <nav class="tabs">
      <button type="button" class="tab-button active" data-tab="reels">Reels</button>
      <button type="button" class="tab-button" data-tab="tools">Tools</button>
    </nav>

    <section class="tab-panel" data-tab="reels">
      <form id="reel-form">
        <label for="reel-url-input">Paste a reel link</label>
        <input id="reel-url-input" type="url" inputmode="url" placeholder="https://www.instagram.com/reel/..." required />
        <button id="reel-submit" type="submit">Save reel</button>
        <p id="reel-error" class="error" aria-live="polite" hidden></p>
      </form>
      <div id="reels-list"></div>
    </section>

    <section class="tab-panel" data-tab="tools" hidden>
      <input id="tools-search" type="search" placeholder="Search tools by name or category" />
      <div id="tools-list"></div>
    </section>
  </main>

  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

```js
// src/main.js
import { isUnlocked, setStoredPasscode } from "./auth.js";
import { fetchReels, fetchTools, submitReel } from "./api.js";
import { renderReelCard, renderToolRow, filterTools } from "./render.js";

const $ = (id) => document.getElementById(id);
let allTools = [];

function showApp() {
  $("passcode-screen").hidden = true;
  $("app").hidden = false;
  loadReels();
  loadTools();
}

async function loadReels() {
  const list = $("reels-list");
  list.textContent = "Loading…";
  try {
    const reels = await fetchReels();
    list.innerHTML = reels.length ? reels.map(renderReelCard).join("") : "<p>No reels saved yet.</p>";
  } catch (err) {
    list.textContent = `Couldn't load reels: ${err.message}`;
  }
}

async function loadTools() {
  const list = $("tools-list");
  list.textContent = "Loading…";
  try {
    allTools = await fetchTools();
    renderToolsList(allTools);
  } catch (err) {
    list.textContent = `Couldn't load tools: ${err.message}`;
  }
}

function renderToolsList(tools) {
  $("tools-list").innerHTML = tools.length ? tools.map(renderToolRow).join("") : "<p>No tools saved yet.</p>";
}

function switchTab(tab) {
  document.querySelectorAll(".tab-panel").forEach((el) => {
    el.hidden = el.dataset.tab !== tab;
  });
  document.querySelectorAll(".tab-button").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
}

if (isUnlocked()) {
  showApp();
}

$("passcode-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("passcode-input").value.trim();
  if (!value) return;
  setStoredPasscode(value);
  showApp();
});

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

$("tools-search").addEventListener("input", (e) => {
  renderToolsList(filterTools(allTools, e.target.value));
});

$("reel-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("reel-url-input");
  const error = $("reel-error");
  const button = $("reel-submit");
  const url = input.value.trim();
  if (!url) return;
  error.hidden = true;
  button.disabled = true;
  button.textContent = "Saving…";
  const result = await submitReel(url);
  button.disabled = false;
  button.textContent = "Save reel";
  if (!result.ok) {
    error.textContent = result.error;
    error.hidden = false;
    return;
  }
  input.value = "";
  loadReels();
});
```

```css
/* src/style.css (append to the file from Task 1) */
.tabs { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.tab-button { padding: 0.5rem 1rem; border: 1px solid #888; background: none; border-radius: 6px; cursor: pointer; }
.tab-button.active { background: #333; color: #fff; }
form { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.error { color: #c0392b; }
.reel-card, .tool-row { border: 1px solid #ddd; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; }
.badge-review { background: #f39c12; color: #fff; border-radius: 4px; padding: 0.1rem 0.4rem; font-size: 0.75rem; margin-left: 0.5rem; }
```

```json
// public/manifest.webmanifest
{
  "name": "Reel Vault",
  "short_name": "ReelVault",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#111111",
  "icons": [{ "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

```svg
<!-- public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#111111"/>
  <text x="50" y="62" font-size="48" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif">RV</text>
</svg>
```

- [ ] **Step 2: Manually verify in the browser**

Run: `npm run dev`, open the printed local URL.
Expected: the passcode screen appears; entering any non-empty value and submitting reveals the Reels/Tools tabs. `fetchReels`/`fetchTools` will fail with a network/CORS error at this point (`src/config.js` still has placeholder Supabase values) — confirm the error message renders in the list area instead of crashing the page. This is expected until Task 13's manual setup is done; the goal here is confirming the UI wiring itself works, not a live data round trip.

- [ ] **Step 3: Run the full test suite once more**

Run: `npm test`
Expected: all tests from Tasks 1, 2, 10, 11 still PASS (main.js has no tests of its own, but this confirms nothing it imports broke).

- [ ] **Step 4: Commit**

```bash
git add index.html src/main.js src/style.css public/manifest.webmanifest public/icon.svg
git commit -m "Wire passcode gate, reel feed, and tools tab into the PWA shell"
```

---

### Task 13: Setup docs

**Files:**
- Create: `docs/supabase-setup.md`
- Create: `docs/launch-checklist.md`

**Interfaces:**
- Consumes: nothing — reference documentation for Daniel's manual deployment steps.

- [ ] **Step 1: Write the setup runbook**

```markdown
<!-- docs/supabase-setup.md -->
# Supabase Setup

## Project

1. Create a free project at supabase.com.
2. In the SQL Editor, paste and run `supabase/schema.sql`. Expect "Success. No rows returned"; `reels`, `tools`, and `reel_tools` visible in Table Editor.
3. From Project Settings -> API, copy the Project URL and the **anon** public key into `src/config.js` (`supabaseUrl`, `supabaseAnonKey`).

## Edge function

1. Install the Supabase CLI and Deno if not already present.
2. From the repo root: `supabase functions deploy submit-reel`.
3. Set the function's secrets (never commit these):
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set REEL_VAULT_PASSCODE=<a PIN only you know>
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase Edge Runtime — do not set them manually.
4. Copy the deployed function's URL (`https://<project-ref>.supabase.co/functions/v1/submit-reel`) into `src/config.js` (`submitReelUrl`).
```

- [ ] **Step 2: Write the launch checklist**

```markdown
<!-- docs/launch-checklist.md -->
# Reel Vault Launch Checklist

Everything code-side is built. These are the manual steps only Daniel can do (accounts, credentials, spend).

## 1. Supabase + edge function

- [ ] Follow `docs/supabase-setup.md` end to end.
- [ ] Confirm `src/config.js` has real values (no `REPLACE_WITH_...` placeholders left).

## 2. Local end-to-end check (with real credentials)

- [ ] `npm run dev`, unlock with your chosen passcode, paste a real Instagram reel URL, submit.
- [ ] Confirm the reel appears in the feed with a summary and a viability score within a few seconds.
- [ ] Confirm the Tools tab shows any tools mentioned in that reel, and that searching by name/category filters correctly.
- [ ] Paste an obviously-wrong URL (e.g. a TikTok link) and confirm you get a clear inline error, not a crash.

## 3. Deploy the frontend

- [ ] `npm run build`, then deploy `dist/` to Netlify or Vercel (same flow as `video-to-food`).
- [ ] Open the production URL on your phone, confirm the passcode screen appears, and "Add to Home Screen" works (manifest is wired).

## 4. Ongoing use

- [ ] Save a batch of real reels from your Saved collection to confirm the flow holds up across different content types (business ideas vs. tool roundups vs. neither).
```

- [ ] **Step 3: Commit**

```bash
git add docs/supabase-setup.md docs/launch-checklist.md
git commit -m "Add Supabase setup runbook and launch checklist"
```

---

## Self-Review Notes

- **Spec coverage:** ingestion form (Task 12) -> oEmbed fetch (Task 4) -> Claude structured analysis (Task 5) -> reel + tools persistence with graceful degradation (Tasks 3, 6-9) -> Tools tab search/recall (Tasks 11-12) -> passcode gate (Task 2) -> docs for the manual Supabase/deploy steps (Task 13). All spec sections are covered; the only spec item deliberately deferred is the Phase 2 Claude Code MCP integration, which the spec itself marks out of scope.
- **Type consistency checked:** `Tool`/`ToolsRepo` (Task 6) are the exact types imported unchanged in Task 7 (`supabaseToolsRepo.ts`) and Task 8 (`handler.ts`); `ClaudeClient`/`ReelAnalysis`/`analyzeReel` (Task 5) match their usage in Task 8; `ReelsRepo`/`HandlerDeps`/`handleSubmitReel` (Task 8) match their usage in Task 9; frontend functions (`getStoredPasscode`, `fetchReels`, `fetchTools`, `submitReel`, `renderReelCard`, `renderToolRow`, `filterTools`) are imported with matching names and signatures in Task 12's `main.js`.
- **No placeholders:** the only "fill in later" values are `src/config.js`'s Supabase URL/anon key/function URL, which are real per-deployment application config (matching the identical pattern already used in `video-to-food/smoke-test/src/config.js`), not plan placeholders — Task 13 explicitly directs Daniel to replace them.
