import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { getEnrolledDevices } from "@/lib/queries/security";
import { DetailHeader } from "@/components/hub-header";
import { DocumentsLock } from "@/components/documents-lock";
import { DocumentsLockSettings } from "@/components/documents-lock-settings";

/** The lock on the family's documents, reachable from Settings as well as
 * from Family → Documents, where it has always lived and still does.
 *
 * Gated exactly as it is there: while the documents are locked this page
 * shows the unlock prompt and nothing else. The settings below it can add a
 * face, fingerprint or device passcode, and that alone would open the
 * documents -- so offering them to someone who has not unlocked would turn
 * "set up a lock" into a way around it. */
export default async function PrivacySettingsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const lock = await getLockState(me.id);

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Privacy & lock" />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 0.25rem" }}>
          The lock on the family&rsquo;s documents. It is the same one as on{" "}
          <Link href="/family?seg=documents" style={{ color: "var(--color-accent-700)" }}>
            Family → Documents
          </Link>
          , so a change here is a change there.
        </p>
        {lock.unlocked ? (
          <DocumentsLockSettings hasPin={lock.hasPin} devices={await getEnrolledDevices(me.id)} unlocked={lock.unlocked} />
        ) : (
          <div className="kin-docs-state">
            <DocumentsLock hasPin={lock.hasPin} hasBiometric={lock.credentialCount > 0} />
          </div>
        )}
      </div>
    </div>
  );
}
