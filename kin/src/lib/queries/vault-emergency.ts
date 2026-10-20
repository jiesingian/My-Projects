import { createClient } from "@/lib/supabase/server";
import { asStatus, type EmergencyStatus } from "@/lib/vault-emergency";

/** Emergency access to the vault (20261015120000), read for either side.
 * Which rows come back is row-level security's call: a household's
 * grown-ups get their own list, requests and log; a trusted person gets the
 * rows that name them; anyone else gets nothing. The status of each request
 * comes from the database, never from this clock. */

export type TrustedPerson = { id: string; memberId: string; name: string; household: string; waitDays: number };
export type Candidate = { memberId: string; name: string; household: string };
export type EmergencyRequest = {
  id: string;
  familyId: string;
  familyName: string;
  memberName: string;
  memberHousehold: string;
  reason: string;
  waitDays: number;
  requestedAt: string;
  opensAt: string;
  endsAt: string;
  status: EmergencyStatus;
  mine: boolean;
  answeredBy: string | null;
};
export type OpenedItem = { id: string; who: string; label: string; at: string };
/** One line to the household's grown-ups (20261020170000): why a trusted
 * person from another household came off the list. */
export type EmergencyNotice = { id: string; body: string };
/** A parents-only document, and whether emergency access may open it. */
export type ParentsOnlyDoc = { id: string; folderId: string | null; title: string; owner: string | null; shared: boolean };
/** A household that named the signed-in person. */
export type NamedBy = { familyId: string; familyName: string; waitDays: number };

async function requests(): Promise<EmergencyRequest[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("vault_emergency_request_list");
  return (data ?? []).map((r) => ({
    id: r.id,
    familyId: r.family_id,
    familyName: r.family_name,
    memberName: r.member_name,
    memberHousehold: r.member_household_name,
    reason: r.reason,
    waitDays: r.wait_days,
    requestedAt: r.requested_at,
    opensAt: r.opens_at,
    endsAt: r.ends_at,
    status: asStatus(r.status),
    mine: r.mine,
    answeredBy: r.answered_by_name,
  }));
}

/** The household's own side: who it trusts, who it could, what was asked,
 * and every item opened. Only for a grown-up; a child's queries come back
 * empty anyway. While the reader's own lock is shut only the requests are
 * fetched -- enough to say no -- and not the candidates or the log. */
export async function getEmergencyOwnerView(familyId: string, unlocked: boolean): Promise<{
  trusted: TrustedPerson[];
  candidates: Candidate[];
  requests: EmergencyRequest[];
  opened: OpenedItem[];
  notices: EmergencyNotice[];
  parentsOnly: ParentsOnlyDoc[];
}> {
  const supabase = await createClient();
  const [{ data: trusted }, { data: candidates }, all, { data: opened }, { data: notices }, { data: parentsOnly }] = await Promise.all([
    supabase
      .from("vault_emergency_contacts")
      .select("id, member_id, member_name, member_household_name, wait_days")
      .eq("family_id", familyId)
      .order("created_at"),
    unlocked ? supabase.rpc("vault_emergency_candidates") : Promise.resolve({ data: [] }),
    requests(),
    unlocked
      ? supabase
          .from("vault_emergency_opens")
          .select("id, member_name, item_label, opened_at")
          .eq("family_id", familyId)
          .order("opened_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    supabase.from("vault_emergency_notices").select("id, body").eq("family_id", familyId).is("dismissed_at", null).order("created_at"),
    // The parents-only documents, which the documents' own policy hands to
    // a parent and to nobody else: the list under "Share in an emergency".
    unlocked
      ? supabase
          .from("doc_entries")
          .select("id, folder_id, title, share_in_emergency, owner:owner_member_id(full_name)")
          .eq("family_id", familyId)
          .eq("visibility", "parents")
          .order("title")
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  return {
    trusted: (trusted ?? []).map((t) => ({ id: t.id, memberId: t.member_id, name: t.member_name, household: t.member_household_name, waitDays: t.wait_days })),
    candidates: (candidates ?? []).map((c) => ({ memberId: c.member_id, name: c.full_name, household: c.household_name })),
    requests: all.filter((r) => r.familyId === familyId && !r.mine),
    opened: (opened ?? []).map((o) => ({ id: o.id, who: o.member_name, label: o.item_label, at: o.opened_at })),
    notices: (notices ?? []).map((n) => ({ id: n.id, body: n.body })),
    parentsOnly: (parentsOnly ?? []).map((d) => ({
      id: d.id,
      folderId: d.folder_id,
      title: d.title,
      owner: (d.owner as unknown as { full_name: string } | null)?.full_name ?? null,
      shared: d.share_in_emergency,
    })),
  };
}

/** The trusted person's side: the households that named them, and what they
 * have asked of each. */
export async function getEmergencyTrustedView(memberId: string): Promise<{ namedBy: NamedBy[]; requests: EmergencyRequest[] }> {
  const supabase = await createClient();
  const [{ data: named }, all] = await Promise.all([
    supabase.from("vault_emergency_contacts").select("family_id, family_name, wait_days").eq("member_id", memberId).order("created_at"),
    requests(),
  ]);
  return {
    namedBy: (named ?? []).map((n) => ({ familyId: n.family_id, familyName: n.family_name, waitDays: n.wait_days })),
    requests: all.filter((r) => r.mine),
  };
}

export type EmergencyItem = { kind: "password" | "document"; id: string; group: string; label: string; owner: string | null; fileCount: number };

/** The names in the household's vault, while access is open. Null
 * when it is not open (the database refuses, and says so). */
export async function getEmergencyItems(requestId: string): Promise<EmergencyItem[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vault_emergency_items", { p_request: requestId });
  if (error) return null;
  return (data ?? []).map((i) => ({
    kind: i.kind === "document" ? "document" : "password",
    id: i.id,
    group: i.grp,
    label: i.label,
    owner: i.owner_name,
    fileCount: i.file_count,
  }));
}
