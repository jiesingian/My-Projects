"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import type { ActionState } from "@/lib/actions/auth";

export async function createDocEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the entry a title." };

  let folderId = String(formData.get("folder_id") ?? "");
  const newFolderName = String(formData.get("new_folder_name") ?? "").trim();
  if (folderId === "__new__" && newFolderName) {
    const { data: folder, error: folderErr } = await supabase
      .from("doc_folders")
      .insert({ family_id: me.family_id, name: newFolderName })
      .select()
      .single();
    if (folderErr) return { error: folderErr.message };
    folderId = folder.id;
  }
  if (!folderId || folderId === "__new__") return { error: "Choose or name a folder." };

  const ownerMemberId = String(formData.get("owner_member_id") ?? "") || null;
  const expiresAt = String(formData.get("expires_at") ?? "") || null;
  const docType = String(formData.get("doc_type") ?? "").trim() || null;
  const referenceNo = String(formData.get("reference_no") ?? "").trim() || null;
  const visibility = String(formData.get("visibility") ?? "family");
  const note = String(formData.get("note") ?? "").trim() || null;

  const { data: entry, error: entryErr } = await supabase
    .from("doc_entries")
    .insert({
      family_id: me.family_id,
      folder_id: folderId,
      title,
      owner_member_id: ownerMemberId,
      expires_at: expiresAt,
      doc_type: docType,
      reference_no: referenceNo,
      visibility,
      note,
      created_by: me.id,
    })
    .select()
    .single();
  if (entryErr) return { error: entryErr.message };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    const path = `${me.family_id}/${entry.id}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file, {
      contentType: file.type || undefined,
    });
    if (uploadErr) return { error: `Entry saved, but "${file.name}" failed to upload: ${uploadErr.message}` };

    await supabase.from("doc_files").insert({
      entry_id: entry.id,
      family_id: me.family_id,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      storage_path: path,
      created_by: me.id,
    });
  }

  revalidatePath("/family");
  redirect(`/family/documents/${folderId}`);
}

export async function getDocFileUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 60 * 5);
  if (error) return null;
  return data.signedUrl;
}

export async function deleteDocFileAction(fileId: string, folderId: string) {
  const supabase = await createClient();
  const { data: file } = await supabase.from("doc_files").select("storage_path").eq("id", fileId).maybeSingle();
  if (file) {
    await supabase.storage.from("documents").remove([file.storage_path]);
    await supabase.from("doc_files").delete().eq("id", fileId);
  }
  revalidatePath(`/family/documents/${folderId}`);
}
