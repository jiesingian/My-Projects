import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { getEnrolledDevices } from "@/lib/queries/security";
import { DetailHeader } from "@/components/hub-header";
import { DocumentsLock } from "@/components/documents-lock";
import { DocumentsLockSettings } from "@/components/documents-lock-settings";
import { keepKidViewOut } from "@/lib/kid-view";
import { isGrownUp } from "@/lib/roles";
import { readAccess } from "@/lib/access";
import { householdZone } from "@/lib/household-zone";
import { getEmergencyOwnerView, getEmergencyTrustedView } from "@/lib/queries/vault-emergency";
import { VaultEmergencySettings } from "@/components/vault-emergency-settings";
import { VaultEmergencyTrusted } from "@/components/vault-emergency-trusted";
import { KinAiSetting } from "@/components/kin-ai-ask";
import { createClient } from "@/lib/supabase/server";
import { householdPhrase, openedLine, ownerStatusLine, trustedStatusLine } from "@/lib/vault-emergency";

/** The lock on the family's documents, reachable from Settings as well as
 * from Family → Vault, where it has always lived and still does.
 *
 * Gated exactly as it is there: while the documents are locked this page
 * shows the unlock prompt and nothing else. The settings below it can add a
 * face, fingerprint or device passcode, and that alone would open the
 * documents -- so offering them to someone who has not unlocked would turn
 * "set up a lock" into a way around it.
 *
 * Emergency access (20261015120000; within the household since
 * 20261020235000) lives here too, both sides of it: which grown-up of this
 * household it trusts, which parents-only documents may open, and -- for
 * the grown-up named -- the way to ask. Naming someone, Allow now, the share
 * list and the log of what was opened wait for the lock; Deny and Take back
 * do not, because the push about a request lands here. */
export default async function PrivacySettingsPage() {
  await keepKidViewOut();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const lock = await getLockState(me.id);
  const grownUp = isGrownUp(me.role);
  const tz = await householdZone();
  const supabase = await createClient();
  const [owner, trusted, kinAi] = await Promise.all([
    grownUp ? getEmergencyOwnerView(me.family_id, lock.unlocked) : Promise.resolve(null),
    grownUp ? getEmergencyTrustedView(me.id) : Promise.resolve(null),
    // Whether this person has said yes to Kin AI (20261030131701).
    supabase.rpc("kin_ai_ok"),
  ]);

  const dates = (r: { opensAt: string; endsAt: string }) => ({ opensAt: new Date(r.opensAt), endsAt: new Date(r.endsAt) });

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Privacy & lock" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <p style={{ fontSize: "0.84375rem", lineHeight: 1.5, color: "var(--color-neutral-700)", margin: "0 0 0.25rem" }}>
          The lock on the family&rsquo;s documents. It is the same one as on{" "}
          <Link href="/family?seg=documents" style={{ color: "var(--color-accent-700)" }}>
            Family → Vault
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

        <KinAiSetting allowed={kinAi.data === true} />

        {owner && (
          <VaultEmergencySettings
            trusted={owner.trusted}
            candidates={owner.candidates}
            notices={owner.notices}
            parentsOnly={owner.parentsOnly}
            isParent={me.role === "parent"}
            plus={readAccess(me.families).plus}
            unlocked={lock.unlocked}
            requests={owner.requests.map((r) => ({
              id: r.id,
              who: r.memberName,
              household: r.memberHousehold,
              reason: r.reason,
              status: r.status,
              line: ownerStatusLine({ status: r.status, ...dates(r), answeredBy: r.answeredBy }, tz),
            }))}
            opened={owner.opened.map((o) => ({ id: o.id, line: openedLine(o.who, o.label, new Date(o.at), tz) }))}
          />
        )}

        {trusted && trusted.namedBy.length > 0 && (
          <VaultEmergencyTrusted
            households={trusted.namedBy.map((n) => {
              const mine = trusted.requests.filter((r) => r.familyId === n.familyId);
              const latest = mine[0];
              // A grant still open while a newer request (to renew it) waits:
              // the way in stays on the card.
              const open = mine.find((r) => r.status === "open");
              const view = (r: (typeof mine)[number]) => ({ id: r.id, status: r.status, line: trustedStatusLine({ status: r.status, ...dates(r) }, tz) });
              return {
                familyId: n.familyId,
                title: `Emergency access to ${householdPhrase(n.familyName)}'s vault`,
                waitDays: n.waitDays,
                latest: latest ? view(latest) : null,
                open: open ? view(open) : null,
              };
            })}
          />
        )}
      </div>
    </div>
  );
}
