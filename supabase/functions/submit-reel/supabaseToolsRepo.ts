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
