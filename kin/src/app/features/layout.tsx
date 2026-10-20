import Link from "next/link";
import { paletteCss, PALETTE_NEW_MEMBER } from "@/lib/palettes";
import { FEATURE_PAGES } from "@/lib/feature-pages";

/** The public feature pages (lib/feature-pages.ts): outside the app's shell,
 * like the legal pages and the home page, because the reader has no
 * account yet. Kin Coral, the public look. Server-rendered, no client code
 * of its own, so it adds nothing to what the app downloads. */
export default function FeaturesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="kin-legal kin-feature">
      <style>{paletteCss(PALETTE_NEW_MEMBER)}</style>
      <nav className="kin-legal-nav" aria-label="Kin">
        <Link href="/" className="kin-welcome-logo">
          Kin
        </Link>
        <Link href="/login">Sign in</Link>
        <Link href="/" className="btn btn-primary kin-feature-start">
          Start with Kin
        </Link>
      </nav>
      <nav className="kin-feature-tabs" aria-label="What Kin does">
        {FEATURE_PAGES.map((p) => (
          <Link key={p.slug} href={`/features/${p.slug}`}>
            {p.name}
          </Link>
        ))}
      </nav>
      <article className="kin-legal-body">{children}</article>
      <footer className="kin-feature-foot">
        <nav className="kin-welcome-legal" aria-label="Legal">
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/refunds">Refunds</Link>
        </nav>
      </footer>
    </main>
  );
}
