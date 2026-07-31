# Reel Vault — Design Spec

Date: 2026-07-26

## Problem

Daniel saves a lot of Instagram reels, mostly business ideas and tool recommendations. There's no system for capturing them — ideas and tools get lost in the Saved collection, un-evaluated and un-searchable. He wants a personal app that: (1) lets him paste a reel link and get an LLM-generated summary + business-viability score, and (2) builds a searchable catalog of tools mentioned across reels, so he can look them up while working on other projects.

## Scope

This spec covers **Phase 1: the web app** — ingestion, summarization/evaluation, and the tools catalog. It is a single-user personal tool (Daniel only), built as an installable PWA.

**Out of scope for this spec** (future, separate spec):
- A Claude Code skill/MCP server that queries the tools catalog from inside a coding session ("any tools I saved for X?"). This is a fast-follow once the catalog itself is proven useful.
- Any Instagram integration beyond fetching a reel's public caption (no scraping the Saved collection, no video/audio analysis).

## User flow

1. Daniel opens the PWA (passcode-gated) and pastes a reel URL into a form, with an optional "what's this about?" note field.
2. If a note was provided, it's used directly. Otherwise the backend tries to fetch the reel's public caption via Instagram's oEmbed endpoint, best-effort. **In practice this always returns nothing** — Instagram's oEmbed now redirects to a login-walled page rather than returning JSON, confirmed by live testing after launch — so the note field is the real mechanism for giving the LLM something to analyze; oEmbed is kept only as a harmless, no-cost fallback attempt.
3. Backend calls an LLM with the note/caption + URL, asking for a structured JSON response: summary, category, viability evaluation, and any tools mentioned.
4. The reel is saved and appears in a feed with its summary and viability score.
5. Any tools mentioned are added to (or matched against) a separate Tools tab, linked back to the source reel.
6. Daniel can browse/search the Tools tab by name or category at any time — this is the "recall" mechanism for Phase 1.

If no note/caption is available, the model is instructed to say so plainly rather than inventing plausible-sounding specifics, and the reel is always flagged `needs_review` in that case regardless of what the model returns. If the LLM call fails outright, the reel is still saved (URL only) and flagged as needing review rather than being dropped.

## Architecture

- **Frontend:** Single-page PWA, installable to the home screen. Two views: a submit form + feed of saved reels, and a Tools tab (search/filter catalog).
- **Backend:** Supabase (Postgres + Edge Functions), matching the stack used in `video-to-food`.
- **Auth:** A simple PIN/passcode gate on the PWA. No multi-user auth — this is Daniel's personal tool.
- **LLM:** OpenRouter's OpenAI-compatible endpoint, model `nvidia/nemotron-3-super-120b-a12b:free`, called server-side from the Edge Function that handles submission. **Running at zero cost is a standing constraint**, so the model must be a free (`:free`) one; it must also support structured outputs, since the request sends a strict `json_schema`. (Provider history: originally spec'd against the Claude API; switched to GitHub Models to avoid spending Anthropic credits on a personal low-volume tool; moved to OpenRouter on 2026-07-31 after GitHub Models was fully retired on 2026-07-30. See `docs/supabase-setup.md` for how to verify a replacement model and for free-tier rate limits.)

## Data model

```
reels
  id                  uuid, pk
  url                 text, not null
  caption             text, nullable        -- manual note if provided, else oEmbed (usually null in practice)
  summary             text, nullable
  category            text, nullable         -- 'business-idea' | 'tool' | 'other'
  viability_score      int, nullable          -- 1-5
  viability_reasoning  jsonb, nullable         -- {market, competition, feasibility, cost_to_launch, reasoning}
  needs_review        boolean, default false  -- true if caption/LLM step failed
  created_at          timestamptz, default now()

tools
  id          uuid, pk
  name        text, not null
  category    text, nullable                 -- e.g. "video-editing", "no-code", "ai-video"
  note        text, nullable                 -- short description from the reel
  created_at  timestamptz, default now()

reel_tools
  reel_id  uuid, fk -> reels.id
  tool_id  uuid, fk -> tools.id
  primary key (reel_id, tool_id)
```

## LLM integration

On submit, the Edge Function calls the model once per reel with the caption (if available) and URL, requesting structured JSON output (`response_format: json_schema`, strict mode) shaped like:

```json
{
  "summary": "string",
  "category": "business-idea | tool | other",
  "viability": {
    "market_demand": "string",
    "competition": "string",
    "feasibility": "string",
    "cost_to_launch": "string",
    "score": 1,
    "reasoning": "string"
  },
  "tools_mentioned": [
    {"name": "string", "category": "string", "note": "string"}
  ]
}
```

**Viability lens:** standard startup framework — market demand, competition/differentiation, feasibility for a solo/small builder, rough cost/effort to launch — plus an overall 1–5 score with reasoning. This is a prompt template, not hardcoded logic, so the framework can be tuned later without a schema change.

If the caption is missing, the model is asked to work from the URL alone and produce a lower-confidence summary rather than failing outright.

## Tools catalog (recall mechanism, Phase 1)

A second tab in the same app. Search/filter by name or category; each tool entry shows which reel(s) it came from (with a link back). New tools are upserted by name — if "CapCut" already exists, a new mention adds a `reel_tools` link rather than duplicating the row.

## Error handling

- No note provided and oEmbed fetch fails (the normal case) → reel saved with `caption = null`, the model still runs on URL alone and is told not to invent specifics; `needs_review` is forced true.
- LLM call fails or returns malformed JSON → reel saved with `needs_review = true`, no summary/score; Daniel can retry manually later (retry button, not in this spec's initial cut if time-constrained).
- No user-facing error states beyond "needs review" — this is a low-stakes personal tool.

## Testing

Given this is a personal single-user tool, testing is manual/smoke-test style (matching the `video-to-food` project's `smoke-test/` pattern) rather than a full automated test suite: submit a real reel URL, confirm the summary/score appear, confirm a tool mention lands in the Tools tab.
