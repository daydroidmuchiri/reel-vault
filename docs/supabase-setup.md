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
   openrouter.ai/keys and add a few dollars of credit. The edge function uses
   it to call `openai/gpt-5-nano` through OpenRouter's OpenAI-compatible
   endpoint (`https://openrouter.ai/api/v1`).

   **Provider history:** this ran on GitHub Models until it was
   [fully retired on 2026-07-30](https://github.blog/changelog/2026-07-30-github-models-is-now-retired/),
   which broke analysis outright. OpenRouter is the replacement. `gpt-5-nano`
   costs $0.05/1M input and $0.40/1M output — cents per month at personal
   volume, and ~8x cheaper on input than the `gpt-4.1-mini` it replaces.
   Any OpenRouter model that supports **structured outputs** can be swapped in
   via `MODEL` in `supabase/functions/submit-reel/claude.ts`; the request sets
   `provider: { require_parameters: true }` so OpenRouter only routes to
   providers that honour `json_schema`. Check a candidate first at
   `https://openrouter.ai/api/v1/models?supported_parameters=structured_outputs`.

   All four secrets are required — the function now throws at boot if any is
   missing, rather than starting in a half-configured state.
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase Edge Runtime — do not set them manually.
4. Copy the deployed function's URL (`https://<project-ref>.supabase.co/functions/v1/submit-reel`) into `src/config.js` (`submitReelUrl`).
