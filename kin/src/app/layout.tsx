import type { Metadata, Viewport } from "next";
import { NoPageZoom } from "@/components/no-page-zoom";
import { cookies } from "next/headers";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { paletteById } from "@/lib/palettes";

export const metadata: Metadata = {
  title: "Kin — your family, in one place",
  description: "Your family's calendar, chores, chat, memories and money. Private, in one place.",
  manifest: "/manifest.webmanifest",
  // Kin gets opened from a home screen far more often than from a browser
  // tab, so it asks to be installed like an app: its own name under the icon
  // and no browser chrome around it.
  appleWebApp: { capable: true, title: "Kin", statusBarStyle: "default" },
  // Stops iOS turning things that merely look like phone numbers -- a
  // quantity, a date, an amount -- into blue "call this" links.
  formatDetection: { telephone: false },
};

const BASE_VIEWPORT = {
  width: "device-width",
  initialScale: 1,
  // No pinch-zoom of the page (26 September, Janine: a two-finger zoom kept
  // happening by accident and left the app half off the screen). It used to
  // be allowed on purpose, for anyone who needs a magnifier (WCAG 1.4.4); the
  // way to larger text in Kin is now Settings, Appearance, Text size, which
  // reflows every page instead of magnifying one. Three things, because each
  // browser listens to a different one: this for Android and an installed
  // app, touch-action on <html> for iPhone Safari (which ignores these two),
  // and a gesturestart guard in the root layout for older iPhones. Photos
  // and the family tree keep their own pinch-to-zoom.
  maximumScale: 1,
  userScalable: false,
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
} satisfies Viewport;

/** The phone's status bar takes the member's colour theme, so a cream
 * Hearth page does not sit under a cool-grey bar. Read from the same cookie
 * the root layout uses to switch a dark-only theme into dark mode. */
export async function generateViewport(): Promise<Viewport> {
  const palette = paletteById((await cookies()).get("kin-palette")?.value);
  return {
    ...BASE_VIEWPORT,
    themeColor: palette.darkOnly
      ? palette.dark.bg
      : [
          { media: "(prefers-color-scheme: light)", color: palette.light.bg },
          { media: "(prefers-color-scheme: dark)", color: palette.dark.bg },
        ],
  };
}

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
        <NoPageZoom />
      </body>
    </html>
  );
}
