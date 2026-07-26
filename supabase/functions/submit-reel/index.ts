import { createClient } from "npm:@supabase/supabase-js";
import { fetchInstagramCaption } from "./instagram.ts";
import { createModelClient } from "./claude.ts";
import { createSupabaseToolsRepo } from "./supabaseToolsRepo.ts";
import { handleSubmitReel, type ReelsRepo } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const githubModelsToken = Deno.env.get("GITHUB_MODELS_TOKEN")!;
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
    analysisClient: createModelClient(githubModelsToken),
    reelsRepo,
    toolsRepo: createSupabaseToolsRepo(supabase),
  })
);
