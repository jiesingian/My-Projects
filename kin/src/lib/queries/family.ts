import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import type { Tables } from "@/lib/database.types";

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
      nextDue: next ? `${next.what}${next.when_date ? " " + formatDate(next.when_date) : ""}` : "Nothing scheduled",
      hasAlert: next ? next.status === "due" || next.status === "due_soon" : false,
    };
  });
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
