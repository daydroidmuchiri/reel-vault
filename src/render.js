import { formatRelativeDate } from "./format.js";

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

export function renderReelCard(reel) {
  const scoreLabel = reel.viability_score ? `${reel.viability_score}/5` : "—";
  const badge = reel.needs_review ? '<span class="badge badge-review">Needs review</span>' : "";
  const summary = reel.summary ? escapeHtml(reel.summary) : "No summary yet.";
  return `
    <article class="reel-card">
      <header>
        <a href="${escapeHtml(reel.url)}" target="_blank" rel="noopener">${escapeHtml(reel.url)}</a>
        ${badge}
      </header>
      <p class="summary">${summary}</p>
      <footer>
        <span class="score">Viability: ${scoreLabel}</span>
        <span class="date">${formatRelativeDate(reel.created_at)}</span>
      </footer>
    </article>
  `.trim();
}

export function renderToolRow(tool) {
  const category = tool.category ? escapeHtml(tool.category) : "uncategorized";
  const note = tool.note ? `<p class="tool-note">${escapeHtml(tool.note)}</p>` : "";
  const reelCount = Array.isArray(tool.reel_tools) ? tool.reel_tools.length : 0;
  return `
    <article class="tool-row">
      <h3>${escapeHtml(tool.name)} <span class="tool-category">${category}</span></h3>
      ${note}
      <p class="tool-source-count">Seen in ${reelCount} reel${reelCount === 1 ? "" : "s"}</p>
    </article>
  `.trim();
}

export function filterTools(tools, query) {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter(
    (t) => t.name.toLowerCase().includes(q) || (t.category && t.category.toLowerCase().includes(q)),
  );
}
