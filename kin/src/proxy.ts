import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // The manifest has to stay out of the auth check. It is fetched by the
    // browser on every page, including the login screen, and sending it
    // through here answered it with a redirect to /login -- so the HTML that
    // came back was not a manifest and the "install Kin" prompt never
    // appeared, which is precisely when a new person would want it.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
