import { createClient } from "@/lib/supabase/server";
import { resolvePhotoUrl } from "@/lib/photo-url";
import type { Tables } from "@/lib/database.types";
import { familyDate } from "@/lib/format-family";

export async function getFamilyProfile(familyId: string) {
  const supabase = await createClient();
  const [{ data: family }, { data: addresses }, { data: backgroundRows }] = await Promise.all([
    supabase.from("families").select("background_url, about").eq("id", familyId).maybeSingle(),
    supabase
      .from("family_addresses")
      .select("id, label, address_line, house_no, building, street, barangay, city, province, country, zip_code")
      .eq("family_id", familyId)
      .order("created_at"),
    supabase.from("family_backgrounds").select("id, storage_path, drive_file_id").eq("family_id", familyId).order("created_at", { ascending: false }),
  ]);
  const backgroundPhotos = (backgroundRows ?? [])
    .map((row) => ({ id: row.id, url: resolvePhotoUrl(supabase, row) }))
    .filter((p): p is { id: string; url: string } => p.url !== null);
  return { backgroundUrl: family?.background_url ?? null, about: family?.about ?? null, addresses: addresses ?? [], backgroundPhotos };
}

export async function getMembers(familyId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("*")
    .eq("family_id", familyId)
    .order("created_at");
  return data ?? [];
}

export type HealthSummaryRow = {
  member: Tables<"members">;
  nextDue: string;
  hasAlert: boolean;
};

export async function getHealthSummary(familyId: string): Promise<HealthSummaryRow[]> {
  const supabase = await createClient();
  const members = await getMembers(familyId);
  const fmtDate = await familyDate();
  const { data: schedule } = await supabase
    .from("health_schedule")
    .select("*")
    .eq("family_id", familyId)
    .in("status", ["due", "due_soon", "planned", "scheduled"])
    .order("when_date", { ascending: true });

  return members.map((member) => {
    const next = (schedule ?? []).find((s) => s.member_id === member.id);
    return {
      member,
      nextDue: next ? `${next.what}${next.when_date ? " " + fmtDate(next.when_date) : ""}` : "Nothing scheduled",
      hasAlert: next ? next.status === "due" || next.status === "due_soon" : false,
    };
  });
}

export type TreePerson = {
  id: string;
  memberId: string | null;
  fullName: string;
  dob: string | null;
  notes: string | null;
  avatarUrl: string | null;
  fatherId: string | null;
  motherId: string | null;
  spouseId: string | null;
};

export type FamilyTree = {
  /** Every row on record, member-linked or not -- the editor works from
   * this regardless of whether anyone has been centred on yet. */
  people: TreePerson[];
  centerId: string | null;
  /** Each entry's distance from the centre: 1 is the father/mother
   * themselves (and their siblings and spouse), 2 their parents, and so on
   * outward. Rendered furthest-generation-first. */
  fatherSide: { person: TreePerson; depth: number }[];
  motherSide: { person: TreePerson; depth: number }[];
  /** The centre, their spouse, their siblings, and their children -- the
   * generation the tree is drawn around. */
  core: TreePerson[];
  children: TreePerson[];
  /** On record but not reachable from the centre by any link -- shown
   * separately so adding someone never makes them silently vanish. */
  unplaced: TreePerson[];
};

/** Builds the father-side/mother-side family tree centred on one person, from
 * rows already fetched -- pure, so the partition logic can be tested without
 * a database. getFamilyTree below is the thin part that actually fetches.
 *
 * Nothing in family_tree_people says which side anyone is on -- it falls out
 * of which link pointed at them. From the centre, father_id names one
 * lineage and mother_id the other; everyone reachable by walking further
 * father_id/mother_id links, a spouse_id, or a shared parent (a sibling)
 * outward from there belongs to that same side, however many generations
 * out. Centring on someone else swaps the two sides entirely, because
 * "father's side" only ever means "the centre's father's side".
 */
export function buildFamilyTree(people: TreePerson[], centerMemberId: string | null): FamilyTree {
  const byId = new Map(people.map((p) => [p.id, p]));

  const centerPerson = centerMemberId ? (people.find((p) => p.memberId === centerMemberId) ?? null) : null;
  if (!centerPerson) {
    return { people, centerId: null, fatherSide: [], motherSide: [], core: [], children: [], unplaced: people };
  }

  const siblingsOf = (p: TreePerson) =>
    people.filter((o) => o.id !== p.id && ((p.fatherId && o.fatherId === p.fatherId) || (p.motherId && o.motherId === p.motherId)));
  const childrenOf = (p: TreePerson) => people.filter((o) => o.fatherId === p.id || o.motherId === p.id);

  // excludeId keeps the centre's OTHER parent out of this walk -- without
  // it, the father's spouse_id (the centre's own mother) would pull the
  // entire maternal line into the paternal one at the very first step. A
  // stepparent doesn't trip this: only that one specific id is excluded, so
  // a different spouse_id (father remarried) is still included as this
  // side's own.
  function walkSide(rootId: string | null, excludeId: string | null): { person: TreePerson; depth: number }[] {
    if (!rootId || !byId.has(rootId)) return [];
    const seen = new Set<string>();
    const queue: { person: TreePerson; depth: number }[] = [{ person: byId.get(rootId)!, depth: 1 }];
    const collected: { person: TreePerson; depth: number }[] = [];
    while (queue.length > 0) {
      const { person: p, depth } = queue.shift()!;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      collected.push({ person: p, depth });
      if (p.fatherId && byId.has(p.fatherId)) queue.push({ person: byId.get(p.fatherId)!, depth: depth + 1 });
      if (p.motherId && byId.has(p.motherId)) queue.push({ person: byId.get(p.motherId)!, depth: depth + 1 });
      if (p.spouseId && p.spouseId !== excludeId && byId.has(p.spouseId)) queue.push({ person: byId.get(p.spouseId)!, depth });
      for (const sib of siblingsOf(p)) queue.push({ person: sib, depth });
    }
    return collected.sort((a, b) => b.depth - a.depth);
  }

  const fatherSide = walkSide(centerPerson.fatherId, centerPerson.motherId);
  const motherSide = walkSide(centerPerson.motherId, centerPerson.fatherId);
  const fatherSideIds = new Set(fatherSide.map((e) => e.person.id));
  const motherSideIds = new Set(motherSide.map((e) => e.person.id));

  const core: TreePerson[] = [centerPerson];
  const spouse = centerPerson.spouseId ? byId.get(centerPerson.spouseId) : undefined;
  if (spouse) core.push(spouse);
  for (const sib of siblingsOf(centerPerson)) core.push(sib);

  const childrenIds = new Set<string>();
  const children: TreePerson[] = [];
  for (const child of [...childrenOf(centerPerson), ...(spouse ? childrenOf(spouse) : [])]) {
    if (!childrenIds.has(child.id)) {
      childrenIds.add(child.id);
      children.push(child);
    }
  }
  const coreIds = new Set(core.map((p) => p.id));

  const unplaced = people.filter((p) => !fatherSideIds.has(p.id) && !motherSideIds.has(p.id) && !coreIds.has(p.id) && !childrenIds.has(p.id));

  return { people, centerId: centerPerson.id, fatherSide, motherSide, core, children, unplaced };
}

export async function getFamilyTree(familyId: string, centerMemberId: string | null): Promise<FamilyTree> {
  const supabase = await createClient();
  const [{ data: rows }, members] = await Promise.all([
    supabase.from("family_tree_people").select("*").eq("family_id", familyId),
    getMembers(familyId),
  ]);

  const memberById = new Map(members.map((m) => [m.id, m]));
  const people: TreePerson[] = (rows ?? []).map((r) => {
    const member = r.member_id ? memberById.get(r.member_id) : undefined;
    return {
      id: r.id,
      memberId: r.member_id,
      fullName: member?.full_name ?? r.full_name ?? "Unnamed",
      dob: member?.dob ?? r.dob,
      notes: r.notes,
      avatarUrl: member?.avatar_url ?? null,
      fatherId: r.father_id,
      motherId: r.mother_id,
      spouseId: r.spouse_id,
    };
  });

  return buildFamilyTree(people, centerMemberId);
}

export type DocFolderRow = Tables<"doc_folders"> & {
  fileCount: number;
  flag: string;
  owners: string[];
};

export async function getDocFolders(familyId: string): Promise<DocFolderRow[]> {
  const supabase = await createClient();
  const { data: folders } = await supabase
    .from("doc_folders")
    .select("*")
    .eq("family_id", familyId)
    .order("name");
  const { data: entries } = await supabase
    .from("doc_entries")
    .select("id, folder_id, owner_member_id, expires_at, members:owner_member_id(full_name)")
    .eq("family_id", familyId);

  return (folders ?? []).map((folder) => {
    const inFolder = (entries ?? []).filter((e) => e.folder_id === folder.id);
    const expiringSoon = inFolder.some(
      (e) => e.expires_at && new Date(e.expires_at).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 90,
    );
    return {
      ...folder,
      fileCount: inFolder.length,
      flag: expiringSoon ? "RENEWS SOON" : inFolder.length > 0 ? "COMPLETE" : "EMPTY",
      owners: inFolder
        .map((e) => (e.members as unknown as { full_name: string } | null)?.full_name)
        .filter((v): v is string => !!v),
    };
  });
}

export async function getEmergencyContacts(familyId: string): Promise<Tables<"emergency_contacts">[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("emergency_contacts")
    .select("*")
    .eq("family_id", familyId)
    .order("name");
  return data ?? [];
}

export type MemberLocation = {
  memberId: string;
  name: string;
  role: string;
  sharing: boolean;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  updatedAt: string | null;
};

/** The Quicklinks board: everyone in the household, and for each of them
 * whether they are sharing and what came back last. Members drive the list
 * rather than member_locations, so somebody who has never switched it on
 * still appears -- with an off switch, which is the honest thing to show. */
export async function getMemberLocations(familyId: string): Promise<MemberLocation[]> {
  const supabase = await createClient();
  const [{ data: members }, { data: rows }] = await Promise.all([
    supabase.from("members").select("id, full_name, role, status").eq("family_id", familyId).order("created_at"),
    supabase.from("member_locations").select("member_id, sharing, lat, lng, accuracy_m, updated_at").eq("family_id", familyId),
  ]);

  const byMember = new Map((rows ?? []).map((r) => [r.member_id, r]));
  return (members ?? [])
    .filter((m) => m.status === "active" || m.status === "managed")
    .map((m) => {
      const row = byMember.get(m.id);
      return {
        memberId: m.id,
        name: m.full_name,
        role: m.role,
        sharing: row?.sharing ?? false,
        lat: row?.lat ?? null,
        lng: row?.lng ?? null,
        accuracyM: row?.accuracy_m ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    });
}
