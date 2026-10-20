/** The site's public address, for absolute URLs in metadata, the sitemap
 * and Open Graph images. NEXT_PUBLIC_SITE_URL when Vercel is given one;
 * otherwise production's address (docs/SETUP_FOR_JONATHAN.md). Pages the
 * app itself links to keep using relative paths. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kin-family-app.vercel.app").replace(/\/+$/, "");
