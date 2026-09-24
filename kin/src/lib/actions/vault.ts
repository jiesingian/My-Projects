"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { isGrownUp } from "@/lib/roles";
import type { ActionState } from "@/lib/actions/auth";
import { humanDatabaseError } from "@/lib/db-errors";

// Who may write, and who may read what, is row-level security's call (see
// 20260924100000_family_vault.sql) -- the browser holds the anon key and
// could skip these entirely. What these add is the lock: a member who has
// set a PIN or fingerprint cannot change a password while it is shut, and
// the checks below give the refusal words rather than "0 rows".

export type VaultFields = {
  group: string;
  label: string;
  username: string;
  secret: string;
  note: string;
  visibility: "everyone" | "grown_ups";
};

async function gate(): Promise<{ error: string } | { familyId: string; memberId: string }> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only grown-ups can change the household's passwords." };
  const lock = await getLockState(me.id);
  if (!lock.unlocked) return { error: "Unlock first — the lock closed while this was open." };
  return { familyId: me.family_id, memberId: me.id };
}

type VaultRow = {
  group_name: string;
  label: string;
  username: string | null;
  secret: string;
  note: string | null;
  visibility: "everyone" | "grown_ups";
};

function clean(f: VaultFields): { error: string } | { row: VaultRow } {
  const group = f.group.trim();
  const label = f.label.trim();
  if (!group) return { error: "Pick a group, like Wi-Fi or Door & gate." };
  if (group.length > 40) return { error: "Keep the group name under 40 characters." };
  if (!label) return { error: "Give it a name, like Home Wi-Fi." };
  if (label.length > 80) return { error: "Keep the name under 80 characters." };
  if (!f.secret) return { error: "The password or code is empty." };
  if (f.secret.length > 500) return { error: "That password is longer than 500 characters." };
  if (f.username.length > 200) return { error: "Keep the username under 200 characters." };
  if (f.note.length > 500) return { error: "Keep the note under 500 characters." };
  return {
    row: {
      group_name: group,
      label,
      username: f.username.trim() || null,
      secret: f.secret,
      note: f.note.trim() || null,
      visibility: f.visibility === "grown_ups" ? "grown_ups" : "everyone",
    },
  };
}

export async function addVaultItemAction(fields: VaultFields): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const c = clean(fields);
  if ("error" in c) return c;
  const supabase = await createClient();
  const { error } = await supabase
    .from("family_vault_items")
    .insert({ ...c.row, family_id: g.familyId, created_by: g.memberId });
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}

export async function updateVaultItemAction(id: string, fields: VaultFields): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const c = clean(fields);
  if ("error" in c) return c;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_vault_items")
    .update({ ...c.row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return { error: humanDatabaseError(error.message) };
  if (!data?.length) return { error: "That item is gone — somebody may have removed it." };
  revalidatePath("/family");
  return { error: null };
}

export async function removeVaultItemAction(id: string): Promise<ActionState> {
  const g = await gate();
  if ("error" in g) return g;
  const supabase = await createClient();
  const { error } = await supabase.from("family_vault_items").delete().eq("id", id);
  if (error) return { error: humanDatabaseError(error.message) };
  revalidatePath("/family");
  return { error: null };
}
