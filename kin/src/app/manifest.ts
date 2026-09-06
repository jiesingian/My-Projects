import type { MetadataRoute } from "next";

/** Makes Kin installable to a phone's home screen. `standalone` is the point:
 * opened from the icon it runs without browser chrome, so the tab bar sits
 * where a native app's would rather than above a browser toolbar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kin — Family Operating System",
    short_name: "Kin",
    description: "One household, five ledgers.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f2f7",
    theme_color: "#f2f2f7",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // A maskable copy keeps the mark inside Android's safe zone instead of
      // letting the launcher crop a circle out of the corners.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
