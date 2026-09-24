import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { paletteById } from "@/lib/palettes";

export const metadata: Metadata = {
  title: "Kin — Family Operating System",
  description: "One household, five ledgers.",
  manifest: "/manifest.webmanifest",
  // Kin gets opened from a home screen far more often than from a browser
  // tab, so it asks to be installed like an app: its own name under the icon
  // and no browser chrome around it.
  appleWebApp: { capable: true, title: "Kin", statusBarStyle: "default" },
  // Stops iOS turning things that merely look like phone numbers -- a
  // quantity, a date, an amount -- into blue "call this" links.
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale is deliberately absent. Pinning it to 1 disabled pinch-zoom,
  // which takes the magnifier away from anyone who needs it (WCAG 1.4.4). The
  // usual reason to pin it is to stop iOS zooming when an input takes focus,
  // and .input already prevents that the right way -- by never dropping below
  // a 17px font.
  //
  // Lets the page draw under the notch and home indicator instead of
  // letterboxing inside them, so the tab bar and sheets can paint edge to
  // edge and pad themselves back out with env(safe-area-inset-*) -- which
  // globals.css already does, but only takes effect with this set.
  viewportFit: "cover",
  // Android Chrome does not resize the layout viewport when the software
  // keyboard opens unless asked to, so a fixed bottom tab bar sits behind
  // the keyboard and 100dvh keeps its full-screen value. iOS already does
  // this; this is the line that makes Android behave the same way.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("kin-theme")?.value;
  // A dark-only palette (Dracula, Midnight) is dark whatever the switch says,
  // so the rest of the dark tokens -- charts, shadows, glass -- match it.
  const darkOnly = paletteById(cookieStore.get("kin-palette")?.value).darkOnly;
  const dataTheme = darkOnly ? "dark" : theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <html lang="en" data-theme={dataTheme}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
