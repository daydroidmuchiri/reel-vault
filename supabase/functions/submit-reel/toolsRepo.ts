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
