import type { MetadataRoute } from "next";
import { FEATURE_PAGES } from "@/lib/feature-pages";
import { SITE_URL } from "@/lib/site";

/** What search engines may index: the home page, the feature pages and the
 * legal notices. Nothing behind a session is listed, and robots.ts keeps
 * crawlers out of the app, the API and guest links. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...FEATURE_PAGES.map((p) => ({ url: `${SITE_URL}/features/${p.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/legal/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/legal/licenses`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
