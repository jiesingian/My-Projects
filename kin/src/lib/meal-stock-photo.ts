/** A picture of a dish from Pexels, for a meal the household has not
 * photographed itself (Jonathan, 13 October). The household's own photo
 * always wins; this only fills the plate until there is one.
 *
 * Needs PEXELS_API_KEY (free, docs/SETUP_FOR_JONATHAN.md); without it every
 * meal keeps its monogram plate. Only the dish's name is sent. Each answer is
 * kept for 30 days by Next's fetch cache, so a dish costs one request a month,
 * well inside Pexels' free 200 an hour. Pexels asks for a credit line, which
 * the plate shows. */

export type StockPhoto = { url: string; photographer: string; photographerUrl: string; pageUrl: string };

type PexelsSearch = {
  photos?: { url: string; photographer: string; photographer_url: string; src: { landscape?: string; large?: string } }[];
};

export async function stockPhotoFor(dish: string): Promise<StockPhoto | null> {
  const key = process.env.PEXELS_API_KEY;
  const name = dish.trim();
  if (!key || !name) return null;
  try {
    const query = encodeURIComponent(`${name.toLowerCase()} food`);
    const res = await fetch(`https://api.pexels.com/v1/search?query=${query}&per_page=1&orientation=landscape`, {
      headers: { Authorization: key },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as PexelsSearch;
    const photo = body.photos?.[0];
    const url = photo?.src.landscape ?? photo?.src.large;
    if (!photo || !url) return null;
    return { url, photographer: photo.photographer, photographerUrl: photo.photographer_url, pageUrl: photo.url };
  } catch {
    // A slow or missing Pexels never holds up the meal plan.
    return null;
  }
}
