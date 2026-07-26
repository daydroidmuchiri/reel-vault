// Fetches an Instagram reel's public caption via the oEmbed endpoint.
// Best-effort: Instagram's oEmbed response often omits captions entirely
// (it may return only author_name/html), so a null return is expected and
// handled gracefully by the caller — the reel is still saved and analyzed
// from the URL alone.
export async function fetchInstagramCaption(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const oembedUrl = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`;
  try {
    const res = await fetchImpl(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    const caption = typeof data.title === "string" ? data.title.trim() : "";
    return caption.length > 0 ? caption : null;
  } catch {
    return null;
  }
}
