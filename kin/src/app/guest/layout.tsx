import Link from "next/link";
import { paletteCss, PALETTE_NEW_MEMBER } from "@/lib/palettes";

export const metadata = {
  title: "You're invited · Kin",
  description: "Say if you're coming and what you'll bring. No app needed.",
  robots: { index: false, follow: false },
};

/** A guest's view of one event (app/guest/[token]): public, like the legal
 * pages, because the person has no account -- the link is the key. Kin
 * Coral, the public look. Nothing of the app's shell: no tabs, no session. */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="kin-legal">
      <style>{paletteCss(PALETTE_NEW_MEMBER)}</style>
      <nav className="kin-legal-nav" aria-label="Kin">
        <Link href="/" className="kin-welcome-logo">
          Kin
        </Link>
        <Link href="/">What&rsquo;s Kin?</Link>
        {/* A guest types their name and answer here: the notice says what
            happens to them (Data Privacy Act, the right to be informed). */}
        <Link href="/legal/privacy">Privacy</Link>
      </nav>
      <article className="kin-legal-body">{children}</article>
    </main>
  );
}
