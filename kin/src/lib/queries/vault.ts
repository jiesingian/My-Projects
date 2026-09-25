import { createClient } from "@/lib/supabase/server";

export type VaultItem = {
  id: string;
  group: string;
  label: string;
  username: string | null;
  secret: string;
  note: string | null;
  visibility: "everyone" | "grown_ups";
  /** Who saved it: what the vault's "Whose" filter goes by. */
  createdBy: string | null;
};

/** The household's shared passwords the signed-in member may see. Which rows
 * those are is the database's decision -- a child's query simply comes back
 * without the grown-ups-only ones -- so there is no filter here to forget.
 * Only ever called once the page has checked the lock is open. */
export async function getVaultItems(familyId: string): Promise<VaultItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("family_vault_items")
    .select("id, group_name, label, username, secret, note, visibility, created_by")
    .eq("family_id", familyId)
    .order("group_name")
    .order("label");
  return (data ?? []).map((r) => ({
    id: r.id,
    group: r.group_name,
    label: r.label,
    username: r.username,
    secret: r.secret,
    note: r.note,
    visibility: r.visibility === "grown_ups" ? "grown_ups" : "everyone",
    createdBy: r.created_by,
  }));
}
