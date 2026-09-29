"use server";

import { requireCurrentMember } from "@/lib/session";
import { parseGiphy, type GifResult } from "@/lib/chat-media";

/** GIF search for the chat (29 September), through GIPHY. The key stays on
 * the server; the phone only ever sees the results. Off until
 * GIPHY_API_KEY is set -- the chat page passes `gifReady` the same way the
 * planner passes `scanReady` for flyer scanning.
 *
 * Rated G: the family chat includes children. An empty search shows what is
 * trending. */
export async function searchGifsAction(query: string): Promise<{ results: GifResult[]; error: string | null }> {
  await requireCurrentMember();
  const key = process.env.GIPHY_API_KEY;
  if (!key) return { results: [], error: "GIF search isn't switched on yet." };

  const q = query.trim().slice(0, 50);
  const params = new URLSearchParams({ api_key: key, limit: "24", rating: "g", bundle: "messaging_non_clips" });
  if (q) params.set("q", q);
  const url = `https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), next: { revalidate: 300 } });
    if (!res.ok) return { results: [], error: res.status === 429 ? "Too many GIF searches this hour. Try again soon." : "GIFs didn't load. Try again." };
    return { results: parseGiphy(await res.json()), error: null };
  } catch {
    return { results: [], error: "GIFs didn't load. Try again." };
  }
}
