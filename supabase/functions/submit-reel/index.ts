import { createClient } from "npm:@supabase/supabase-js@^2.110.8";
import { fetchInstagramCaption } from "./instagram.ts";
import { createModelClient } from "./claude.ts";
import { createSupabaseToolsRepo } from "./supabaseToolsRepo.ts";
import { handleSubmitReel, type ReelsRepo } from "./handler.ts";

// `Deno.env.get(...)!` only silences the type checker — a missing secret is
// still undefined at runtime. Fail loudly at boot instead of serving traffic
// in a half-configured state (an undefined REEL_VAULT_PASSCODE would
// otherwise match any request that omits the field). See docs/supabase-setup.md.
function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const supabaseServiceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const openRouterApiKey = requireEnv("OPENROUTER_API_KEY");
const expectedPasscode = requireEnv("REEL_VAULT_PASSCODE");

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
    analysisClient: createModelClient(openRouterApiKey),
    reelsRepo,
    toolsRepo: createSupabaseToolsRepo(supabase),
  })
);
