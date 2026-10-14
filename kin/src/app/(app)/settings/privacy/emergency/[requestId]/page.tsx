import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { DetailHeader } from "@/components/hub-header";
import { DocumentsLock } from "@/components/documents-lock";
import { keepKidViewOut } from "@/lib/kid-view";
import { isGrownUp } from "@/lib/roles";
import { getEmergencyItems, getEmergencyTrustedView } from "@/lib/queries/vault-emergency";
import { EmergencyVaultViewer } from "@/components/vault-emergency-viewer";
import { householdPhrase } from "@/lib/vault-emergency";

/** Another household's vault, read-only, while the emergency access it gave
 * this person is open (20261014205000).
 *
 * The reader's own lock comes first, as it does for their own vault: nothing
 * of the other household is fetched until it is open. Whether the access is
 * open at all is the database's answer, asked fresh on every load -- a grant
 * that was taken back or ran out a minute ago shows nothing. */
export default async function EmergencyVaultPage({ params }: { params: Promise<{ requestId: string }> }) {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  if (!isGrownUp(me.role)) redirect("/settings/privacy");
  const { requestId } = await params;

  const lock = await getLockState(me.id);
  if (!lock.unlocked) {
    return (
      <div>
        <DetailHeader backHref="/settings/privacy" eyebrow="Emergency access" />
        <div className="kin-docs-state" style={{ padding: "0 var(--gutter) 1.375rem" }}>
          <DocumentsLock hasPin={lock.hasPin} hasBiometric={lock.credentialCount > 0} title="Unlock first" blurb="Your own lock comes before anyone else's vault." />
        </div>
      </div>
    );
  }

  const [items, trusted] = await Promise.all([getEmergencyItems(requestId), getEmergencyTrustedView(me.id)]);
  const request = trusted.requests.find((r) => r.id === requestId);
  const household = request ? householdPhrase(request.familyName) : "their household";

  return (
    <div>
      <DetailHeader backHref="/settings/privacy" eyebrow="Emergency access" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        {items === null ? (
          <p style={{ fontSize: "0.875rem", lineHeight: 1.5 }}>
            Emergency access is not open. It may have been taken back, or run out.{" "}
            <Link href="/settings/privacy" style={{ color: "var(--color-accent-700)" }}>
              Back to Privacy &amp; lock
            </Link>
          </p>
        ) : (
          <>
            <h2 style={{ font: "600 1.25rem/1.2 var(--font-heading)", margin: "0 0 0.25rem" }}>
              {household.charAt(0).toUpperCase() + household.slice(1)}&rsquo;s vault
            </h2>
            <p style={{ fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>
              Read-only. Each item you open is shown to their grown-ups, with the time.
            </p>
            <EmergencyVaultViewer requestId={requestId} items={items} />
          </>
        )}
      </div>
    </div>
  );
}
