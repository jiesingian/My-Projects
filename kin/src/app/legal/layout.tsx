import Link from "next/link";
import { paletteCss, PALETTE_NEW_MEMBER } from "@/lib/palettes";
import { OPERATOR, LEGAL_UPDATED } from "@/lib/legal";
import { LegalBack } from "@/app/legal/legal-back";

/** The privacy notice, terms, refund policy and cookies page. Public, like the home page,
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
        <Link href="/legal/cookies">Cookies</Link>
        <Link href="/legal/support">Support</Link>
      </nav>
      <div className="kin-legal-back">
        <LegalBack />
      </div>
      <article className="kin-legal-body">
        <p className="kin-legal-meta">Last updated {LEGAL_UPDATED}</p>
        {missing && (
          <p className="kin-legal-draft">
            Kin&rsquo;s business registration is in progress. Its registered name, address, contact email and
            registration numbers will be published on this page as soon as they are issued.
          </p>
        )}
        {children}
        {/* The licences' notices, reachable from every legal page rather than
            crowding the nav (legal/licenses). */}
        <p className="kin-legal-meta" style={{ marginTop: "2.5rem" }}>
          <Link href="/legal/licenses">Credits and open-source licences</Link>
        </p>
      </article>
    </main>
  );
}
