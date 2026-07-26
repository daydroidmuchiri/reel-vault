export function formatRelativeDate(isoString, now = new Date()) {
  const then = new Date(isoString);
  const diffDays = Math.floor((now - then) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
