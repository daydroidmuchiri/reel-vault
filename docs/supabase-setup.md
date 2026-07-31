# Supabase Setup

## Project

1. Create a free project at supabase.com.
2. In the SQL Editor, paste and run `supabase/schema.sql`. Expect "Success. No rows returned"; `reels`, `tools`, and `reel_tools` visible in Table Editor.
3. From Project Settings -> API, copy the Project URL and the **anon** public key into `src/config.js` (`supabaseUrl`, `supabaseAnonKey`).

## Edge function

1. Install the Supabase CLI and Deno if not already present.
2. From the repo root: `supabase functions deploy submit-reel --no-verify-jwt`.
   The frontend sends no auth header at all when calling this function (no
   `apikey`, no `Authorization` — see `submitReel()` in `src/api.js`), so
   Supabase's default gateway-level JWT check would reject every request with a 401
   before the handler ever runs. `--no-verify-jwt` is safe here because the
   passcode checked inside the handler is the real auth boundary.
3. Set the function's secrets (never commit these):
   ```
   supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
   supabase secrets set REEL_VAULT_PASSCODE=<a long random passphrase, not a short PIN>
   ```
   `OPENROUTER_API_KEY` is an OpenRouter API key — create one at
   openrouter.ai/keys. **No credit card or credit purchase is required**: the
   edge function calls `nvidia/nemotron-3-super-120b-a12b:free` through
   OpenRouter's OpenAI-compatible endpoint (`https://openrouter.ai/api/v1`),
   and that model is free in both directions.

   **Provider history:** this ran on GitHub Models until it was
   [fully retired on 2026-07-30](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/),
   which broke analysis outright. OpenRouter is the replacement, kept on a
   free model to preserve the original zero-cost constraint.

   All four secrets are required — the function throws at boot if any is
   missing, rather than starting in a half-configured state.

### Free-tier limits

OpenRouter caps `:free` models at **20 requests/minute** and **50 requests/day**
(1,000/day once an account has ever purchased $10 in credit). Saving reels by
hand stays far under this. Failed requests can still count toward the daily
quota. If you exceed it, the reel is still saved and flagged **Needs review** —
`handler.ts` degrades rather than dropping data — so a quota hit costs you the
analysis, never the reel.

### Swapping the model

Change `MODEL` in `supabase/functions/submit-reel/claude.ts`. The replacement
must implement **structured outputs**, since the code sends a strict
`json_schema` response format.

Verify at the *endpoint* level, not the model level — the same model is served
by several providers and only some honour `json_schema`, so the model-level
flag is misleading:

```
curl "https://openrouter.ai/api/v1/models/<model-id>/endpoints"
```

Check that at least one endpoint has `pricing.prompt`/`pricing.completion` of
`"0"` and lists `structured_outputs` in `supported_parameters`. (Example: as of
2026-07-31 `google/gemma-4-26b-a4b-it:free` is served by two free endpoints,
and only one of them supports structured outputs.) The request sets
`provider: { require_parameters: true }` so OpenRouter refuses to route to a
non-conforming provider instead of silently downgrading to `json_object`.

Other free, structured-output-capable options as of 2026-07-31:
`openai/gpt-oss-20b:free`, `nvidia/nemotron-nano-9b-v2:free`.
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase Edge Runtime — do not set them manually.
4. Copy the deployed function's URL (`https://<project-ref>.supabase.co/functions/v1/submit-reel`) into `src/config.js` (`submitReelUrl`).
