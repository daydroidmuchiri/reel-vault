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
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set REEL_VAULT_PASSCODE=<a long random passphrase, not a short PIN>
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the Supabase Edge Runtime — do not set them manually.
4. Copy the deployed function's URL (`https://<project-ref>.supabase.co/functions/v1/submit-reel`) into `src/config.js` (`submitReelUrl`).
