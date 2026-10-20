import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Crawlers: the public pages only. The app's screens need a session and
 * would only show the sign-in page; the API and guest links are nobody's
 * to index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/features/", "/legal/"], disallow: ["/api/", "/guest/", "/today", "/planner", "/chat", "/family", "/household", "/wealth", "/journal", "/notes", "/settings", "/onboarding", "/r/", "/join/", "/connect/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
