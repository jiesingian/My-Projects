import Link from "next/link";
import { paletteCss, PALETTE_NEW_MEMBER } from "@/lib/palettes";
import { OPERATOR, LEGAL_UPDATED } from "@/lib/legal";

/** The privacy notice, terms and refund policy. Public, like the home page,
 * because people read them before they have an account -- and an app store
 * reviewer reads them without one at all. Kin Coral, the public look. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const missing = !OPERATOR.name || !OPERATOR.email;
  return (
    <main className="kin-legal">
      <style>{paletteCss(PALETTE_NEW_MEMBER)}</style>
      <nav className="kin-legal-nav" aria-label="Legal">
        <Link href="/" className="kin-welcome-logo">
          Kin
        </Link>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/refunds">Refunds</Link>
      </nav>
      <article className="kin-legal-body">
        <p className="kin-legal-meta">Last updated {LEGAL_UPDATED}</p>
        {missing && (
          <p className="kin-legal-draft">
            Kin&rsquo;s business registration is in progress. Its registered name, address, contact email and
            registration numbers will be published on this page as soon as they are issued.
          </p>
        )}
        {children}
      </article>
    </main>
  );
}
