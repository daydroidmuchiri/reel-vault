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
