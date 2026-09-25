import Link from "next/link";
import { Icon } from "@/components/icons";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { getMembers, getHealthSummary, getDocFolders, getFamilyProfile, getFamilyTree, getEmergencyContacts, getMemberLocations } from "@/lib/queries/family";
import { LocationBoard } from "@/components/location-board";
import { EmergencyContactList } from "@/components/emergency-contact-list";
import { DocumentsLock } from "@/components/documents-lock";
import { DocumentsLockSettings } from "@/components/documents-lock-settings";
import { getLockState } from "@/lib/security/gate";
import { getVaultItems } from "@/lib/queries/vault";
import { FamilyVault } from "@/components/family-vault";
import { VaultBar } from "@/components/vault-bar";
import { VaultWhosePicker } from "@/components/vault-whose-picker";
import { isGrownUp } from "@/lib/roles";
import { getEnrolledDevices } from "@/lib/queries/security";
import { HubHeader } from "@/components/hub-header";
import { Blueprint, Tag, Empty } from "@/components/ui";
import { PendingMemberActions } from "@/components/pending-member-actions";
import { RemoveMemberButton, ReinstateMemberButton } from "@/components/member-status-actions";
import { Avatar } from "@/components/avatar";
import { FamilyBackgroundAlbum } from "@/components/family-background-album";
import { FamilyAboutEditor } from "@/components/family-about-editor";
import { FamilyAddressList } from "@/components/family-address-list";
import { AddChildForm } from "@/components/add-child-form";
import { FamilyTreeChart } from "@/components/family-tree-chart";
import { TreeOffers } from "@/components/tree-offers";
import { getTreeMatches, getTreeOffers, getLinkedFamilies } from "@/lib/queries/tree-links";
import { FamilyTreeEditor } from "@/components/family-tree-editor";
import { AddMeToTreeButton } from "@/components/add-me-to-tree-button";
import { formatAge, initials } from "@/lib/format";

const SEGMENTS = ["profile", "health", "documents", "tree", "quicklinks"] as const;
type Seg = (typeof SEGMENTS)[number];

export default async function FamilyPage({
  searchParams,
}: {
  // `center` is no longer read: the tree is the same for everybody. Old links
  // that carry it still open the tree, and simply ignore it.
  searchParams: Promise<{ seg?: string; who?: string; tab?: string; center?: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const sp = await searchParams;
  const seg: Seg = (SEGMENTS as readonly string[]).includes(sp.seg ?? "") ? (sp.seg as Seg) : "profile";
  const who = sp.who ?? "all";

  const segments = SEGMENTS.map((s) => ({
    // Short on purpose: five tabs share a phone's width, and "Documents" and
    // "Quicklinks" did not fit -- they broke mid-word. The page is already
    // called Family, so the tree does not need to say it again.
    label: s === "profile" ? "Profile" : s === "health" ? "Health" : s === "documents" ? "Vault" : s === "tree" ? "Tree" : "Links",
    href: `/family?seg=${s}`,
    active: s === seg,
  }));

  return (
    <div>
      <HubHeader n="01" title="Family" segments={segments} dateFormat={me.families.date_format} />
      <div style={{ padding: "0 1.375rem 1.375rem" }}>
        {seg === "profile" && <ProfilePane familyId={me.family_id} isOrganiser={me.is_organiser} myId={me.id} myRole={me.role} />}
        {seg === "health" && <HealthPane familyId={me.family_id} />}
        {seg === "documents" && <VaultPane familyId={me.family_id} who={who} tab={sp.tab === "passwords" ? "passwords" : "documents"} meId={me.id} myRole={me.role} />}
        {seg === "tree" && <TreePane familyId={me.family_id} myId={me.id} inviteCode={me.is_organiser ? me.families.invite_code : null} />}
        {seg === "quicklinks" && <QuicklinksPane familyId={me.family_id} meId={me.id} myRole={me.role} />}
      </div>
    </div>
  );
}

async function ProfilePane({ familyId, isOrganiser, myId, myRole }: { familyId: string; isOrganiser: boolean; myId: string; myRole: string }) {
  // Matches add_managed_child, which lets any parent or adult add one.
  const canAddChild = myRole === "parent" || myRole === "adult";
  const [allMembers, { backgroundUrl, about, addresses, backgroundPhotos }] = await Promise.all([getMembers(familyId), getFamilyProfile(familyId)]);
  const pending = allMembers.filter((m) => m.status === "pending");
  const removed = allMembers.filter((m) => m.status === "removed");
  const members = allMembers.filter((m) => m.status !== "pending" && m.status !== "removed");

  return (
    <>
      <FamilyBackgroundAlbum backgroundUrl={backgroundUrl} photos={backgroundPhotos} canEdit={isOrganiser} />
      <FamilyAboutEditor about={about} canEdit={isOrganiser} />
      <FamilyAddressList addresses={addresses} canEdit={isOrganiser} />
      <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0 18px" }} />

      {isOrganiser && pending.length > 0 && (
        <>
          <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.5rem" }}>
            PENDING REQUESTS · {pending.length}
          </div>
          {pending.map((m) => (
            <Blueprint key={m.id} className="bg-[var(--color-accent-100)]" style={{ padding: "0.75rem", marginBottom: "0.625rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Avatar url={m.avatar_url} initials={initials(m.full_name)} label={m.full_name} size={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: "600 0.9375rem/1.1 var(--font-heading)", display: "block" }}>{m.full_name}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                  {formatAge(m.dob)} · wants to join as {m.role.replace("_", " ")}
                </span>
              </span>
              <PendingMemberActions memberId={m.id} fullName={m.full_name} />
            </Blueprint>
          ))}
          <div style={{ height: 1, background: "var(--color-divider)", margin: "4px 0 16px" }} />
        </>
      )}
      {/* One column on a phone, two on a desktop — see .kin-memberlist. A
          1000px-wide row holding an avatar and a name is mostly empty space. */}
      <div className="kin-memberlist">
      {members.map((m) => (
        <div
          key={m.id}
          style={{
            display: "flex",
            // The tag and Remove drop under the name at a large text size.
            flexWrap: "wrap",
            gap: "0.5rem 0.75rem",
            alignItems: "center",
            padding: "0.8125rem 0",
            borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
          }}
        >
          <Link href={`/family/members/${m.id}`} style={{ display: "flex", gap: "0.75rem", alignItems: "center", flex: "1 1 13rem", minWidth: 0, textDecoration: "none", color: "inherit" }}>
            <Avatar url={m.avatar_url} initials={initials(m.full_name)} label={m.full_name} size={44} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ font: "600 1.125rem/1.1 var(--font-heading)", display: "block" }}>{m.full_name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                {formatAge(m.dob)} · {m.relationship ?? m.role.replace("_", " ")}
              </span>
            </span>
          </Link>
          <Tag variant={m.auth_user_id === null ? "neutral" : m.is_organiser ? "accent" : "outline"}>
            {m.auth_user_id === null ? "MANAGED" : m.is_organiser ? "ORGANIZER" : m.status.toUpperCase()}
          </Tag>
          {isOrganiser && m.id !== myId && !m.is_organiser && <RemoveMemberButton memberId={m.id} fullName={m.full_name} />}
        </div>
      ))}
      </div>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.875rem" }}>
        Managed profiles are written by a parent. Children graduate to their own login at 13.
      </div>

      {/* A child arrives long after the household is set up — a baby, or one
          who was simply missed. This used to live only in onboarding, a page
          nobody can return to, so the only apparent way to add a daughter was
          to sign her up for an email account she is far too young to have. */}
      {canAddChild && <AddChildForm />}

      {isOrganiser && removed.length > 0 && (
        <>
          <div className="kin-eyebrow" style={{ margin: "22px 0 8px" }}>
            REMOVED · {removed.length}
          </div>
          {removed.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.625rem 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)", opacity: 0.7 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: "0.875rem" }}>{m.full_name}</span>
              <ReinstateMemberButton memberId={m.id} />
            </div>
          ))}
        </>
      )}
    </>
  );
}

async function HealthPane({ familyId }: { familyId: string }) {
  const rows = (await getHealthSummary(familyId)).filter((r) => r.member.status !== "pending" && r.member.status !== "removed");

  return (
    <>
      {rows.map(({ member, nextDue, hasAlert }) => (
        <Link key={member.id} href={`/family/members/${member.id}?view=health`} style={{ color: "inherit", textDecoration: "none" }}>
          <Blueprint style={{ padding: "0.8125rem", marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0.375rem 0.5rem", marginBottom: "0.5rem" }}>
              <span style={{ font: "600 1.1875rem/1 var(--font-heading)" }}>{member.full_name.split(" ")[0]}</span>
              <Tag variant={hasAlert ? "accent" : "neutral"} className="ml-auto">
                {nextDue}
              </Tag>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))", gap: "0.4375rem 0.875rem", fontSize: "0.8125rem" }}>
              <Fact k="Blood type" v={member.blood_type} />
              <Fact k="Allergies" v={member.allergies} />
              <Fact k="Insurance" v={member.insurance_info} />
              <Fact k="Physician" v={member.physician_name} />
            </div>
          </Blueprint>
        </Link>
      ))}
    </>
  );
}

function Fact({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <span style={{ color: "var(--color-neutral-600)", fontSize: "0.8125rem", display: "block" }}>{k}</span>
      <span style={{ color: v ? "var(--color-text)" : "var(--color-neutral-500)" }}>{v || "Not recorded"}</span>
    </div>
  );
}

/** The folder list is fetched and rendered only once the lock is open.
 * Rendering it and hiding it with CSS would put every document name in the
 * page source of a screen that is supposed to be locked, which is the
 * difference between a lock and a curtain. */
/** The family vault: documents and the passwords the house shares, behind
 * one lock (V1, agreed 25 September). Unlock once and both open, for ten
 * minutes. A "Whose" picker like Wealth's filters both (V2): documents by who
 * they are for, passwords by who saved them. */
async function VaultPane({ familyId, who, tab, meId, myRole }: { familyId: string; who: string; tab: "documents" | "passwords"; meId: string; myRole: string }) {
  const lock = await getLockState(meId);
  if (!lock.unlocked) {
    return (
      <div className="kin-docs-state">
        <DocumentsLock
          hasPin={lock.hasPin}
          hasBiometric={lock.credentialCount > 0}
          title="Family vault"
          blurb="Documents and the passwords the house shares. Opens for ten minutes."
        />
      </div>
    );
  }

  const members = (await getMembers(familyId)).filter((m) => m.status !== "pending" && m.status !== "removed");
  const [folders, devices, vault] = await Promise.all([
    tab === "documents" ? getDocFolders(familyId) : Promise.resolve([]),
    getEnrolledDevices(meId),
    tab === "passwords" ? getVaultItems(familyId) : Promise.resolve([]),
  ]);
  const filtered =
    who === "all"
      ? folders
      : folders.filter((f) => f.owners.includes(members.find((m) => m.id === who)?.full_name ?? "__none__"));
  const items = who === "all" ? vault : vault.filter((i) => i.createdBy === who);

  return (
    <div className="kin-docs-state">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.625rem 1rem", marginBottom: "0.875rem" }}>
        <div className="seg" style={{ flex: "1 1 12rem", margin: 0 }}>
          <Link href={`/family?seg=documents&tab=documents&who=${who}`} data-active={tab === "documents"}>
            Documents
          </Link>
          <Link href={`/family?seg=documents&tab=passwords&who=${who}`} data-active={tab === "passwords"}>
            Passwords
          </Link>
        </div>
        <VaultWhosePicker members={members.map((m) => ({ id: m.id, name: m.full_name }))} who={who} tab={tab} />
      </div>

      {tab === "documents" ? (
        <>
          <Blueprint className="bg-[var(--color-accent-100)] mb-4" style={{ padding: "0.75rem", display: "flex", gap: "0.625rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.8125rem", lineHeight: 1.35 }}>
              Files stay in your connected Drive. Kin holds the index and the expiry dates only.
            </span>
          </Blueprint>
          {filtered.map((folder) => (
            <Link
              key={folder.id}
              href={`/family/documents/${folder.id}`}
              style={{
                display: "flex",
                gap: "0.6875rem",
                alignItems: "center",
                padding: "0.75rem 0",
                borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ font: "600 1rem/1.1 var(--font-heading)", display: "block" }}>{folder.name}</span>
                <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
                  {folder.fileCount} file{folder.fileCount === 1 ? "" : "s"}
                </span>
              </span>
              <Tag variant={folder.flag === "RENEWS SOON" ? "accent" : folder.flag === "EMPTY" ? "outline" : "neutral"}>
                {folder.flag}
              </Tag>
            </Link>
          ))}
          <Link
            href="/family/documents/new"
            className="btn btn-primary btn-block"
            style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "1.125rem" }}
          >
            + NEW ENTRY
          </Link>
        </>
      ) : (
        <>
          {items.length === 0 && who !== "all" ? (
            <p className="kin-vault-empty">Nothing saved by {members.find((m) => m.id === who)?.full_name.split(" ")[0] ?? "them"} yet.</p>
          ) : (
            <FamilyVault items={items} canEdit={isGrownUp(myRole)} />
          )}
          <p className="kin-vault-hint">Press and hold a password to see it. Copy never shows it on screen.</p>
          {!lock.configured && isGrownUp(myRole) && (
            <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "0 0 1.25rem" }}>
              Anyone holding your phone can open these. Set a PIN or Face ID below to lock the vault.
            </p>
          )}
        </>
      )}

      <VaultBar expiresAt={lock.expiresAt} />
      <DocumentsLockSettings hasPin={lock.hasPin} devices={devices} unlocked={lock.unlocked} />
    </div>
  );
}

/** The household's family tree. One tree, the same for everybody in the house
 * -- it used to open on a row of member chips that each re-drew it around a
 * different person, which made a single family look like several trees. The
 * only thing that differs between members now is that each sees themselves
 * highlighted. */
async function TreePane({ familyId, myId, inviteCode }: { familyId: string; myId: string; inviteCode: string | null }) {
  const [tree, allMembers, matches, offers, linkedFamilies] = await Promise.all([
    getFamilyTree(familyId, myId),
    getMembers(familyId),
    getTreeMatches(familyId),
    getTreeOffers(),
    getLinkedFamilies(familyId),
  ]);
  const members = allMembers.filter((m) => m.status !== "pending" && m.status !== "removed");
  const memberIdsInTree = new Set(tree.people.filter((p) => p.memberId).map((p) => p.memberId));
  const unaddedMembers = members.filter((m) => !memberIdsInTree.has(m.id)).map((m) => ({ id: m.id, full_name: m.full_name }));
  const meInTree = tree.people.find((p) => p.memberId === myId) ?? null;

  return (
    <>
      <TreeOffers offers={offers} people={tree.people.map((p) => ({ id: p.id, fullName: p.fullName, dob: p.dob }))} />

      {tree.people.length === 0 || !meInTree ? (
        <>
          <Empty
            icon={<Icon name="users" size={26} />}
            title={tree.people.length === 0 ? "Start the family tree" : "You're not in the tree yet"}
            line="Add yourself, then your father, your mother, and anyone else you know -- the tree grows from there, and everybody in the house sees the same one."
          />
          <AddMeToTreeButton memberId={myId} />
          {tree.people.length > 0 && <FamilyTreeChart people={tree.people} meTreeId={null} matches={matches} linkedFamilies={linkedFamilies} inviteCode={inviteCode} unaddedMembers={unaddedMembers} />}
        </>
      ) : (
        <FamilyTreeChart people={tree.people} meTreeId={meInTree.id} matches={matches} linkedFamilies={linkedFamilies} inviteCode={inviteCode} unaddedMembers={unaddedMembers} />
      )}

      <details className="kin-fold" style={{ marginTop: "1.25rem" }}>
        <summary>Manage people</summary>
        <FamilyTreeEditor people={tree.people} unaddedMembers={unaddedMembers} />
      </details>
    </>
  );
}

/** The two things you go looking for when something has gone wrong: a
 * number to ring, and where everybody is.
 *
 * The location half was held back when this segment shipped, because
 * "location tracker" names two products with opposite ethics -- a directory
 * of saved places, or knowing where the people in your household are. It is
 * the second one, built the only way it is defensible: nobody appears on it
 * until they switch themselves on, a position is only ever written by the
 * device it belongs to, and there is one row per person rather than a trail.
 * See the migration for why each of those is a policy and not a promise. */
async function QuicklinksPane({ familyId, meId, myRole }: { familyId: string; meId: string; myRole: string }) {
  const [contacts, people, members] = await Promise.all([
    getEmergencyContacts(familyId),
    getMemberLocations(familyId),
    getMembers(familyId),
  ]);
  // Every parent in the household, in the order they joined -- including one
  // who is here as a managed profile without a login of their own, since
  // not having an account does not make somebody less of a person to ring.
  // Removed and pending members are left out.
  const parents = members
    .filter((m) => m.role === "parent" && (m.status === "active" || m.status === "managed"))
    .map((m) => ({ id: m.id, name: m.full_name, phone: m.mobile?.trim() || null }));
  return (
    <>
      <div className="kin-eyebrow" style={{ marginBottom: "0.5rem" }}>
        EMERGENCY CONTACTS
      </div>
      <EmergencyContactList contacts={contacts} parents={parents} />

      <div className="kin-eyebrow" style={{ margin: "22px 0 8px" }}>
        PASSWORDS
      </div>
      {/* The Wi-Fi, door codes and logins moved into the Vault with the
          documents (25 September): one place, one unlock. */}
      <Link href="/family?seg=documents&tab=passwords" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: "1.25rem", gap: "0.375rem" }}>
        <Icon name="keyRound" size={15} />
        Passwords are in the Vault
      </Link>

      <div className="kin-eyebrow" style={{ margin: "22px 0 8px" }}>
        WHERE EVERYONE IS
      </div>
      <LocationBoard people={people} meId={meId} myRole={myRole} />
    </>
  );
}
