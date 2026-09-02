import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kin — Family Operating System",
  description: "One household, five ledgers.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("kin-theme")?.value;
  const dataTheme = theme === "light" || theme === "dark" ? theme : undefined;

  return (
    <html lang="en" data-theme={dataTheme}>
      <body>{children}</body>
    </html>
  );
}
