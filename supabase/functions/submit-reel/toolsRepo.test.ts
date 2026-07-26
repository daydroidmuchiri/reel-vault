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
