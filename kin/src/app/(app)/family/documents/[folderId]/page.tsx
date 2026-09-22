import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { getLockState } from "@/lib/security/gate";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocFileRow } from "@/components/doc-file-row";
import { DocEntryDeleteButton } from "@/components/doc-entry-delete-button";
import { DocSelectionProvider } from "@/lib/doc-selection-context";
import { familyDate } from "@/lib/format-family";

export default async function DocFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const fmtDate = await familyDate();
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { folderId } = await params;

  // Every way in has to meet the same door. Gating only the Documents tab
  // would leave a bookmarked folder URL opening the papers directly, which
  // is not a lock with a gap in it -- it is no lock.
  const lock = await getLockState(me.id);
  if (!lock.unlocked) redirect("/family?seg=documents");


  const supabase = await createClient();
  const [{ data: folder }, { data: entries }] = await Promise.all([
    supabase.from("doc_folders").select("*").eq("id", folderId).eq("family_id", me.family_id).maybeSingle(),
    supabase
      .from("doc_entries")
      .select("*, owner:owner_member_id(full_name), doc_files(*)")
      .eq("folder_id", folderId)
      .eq("family_id", me.family_id)
      .order("created_at", { ascending: false }),
  ]);

  if (!folder) redirect("/family?seg=documents");

  return (
    <div>
      <DetailHeader backHref="/family?seg=documents" eyebrow="HUB 01 · DOCUMENTS" />
      <div style={{ padding: "0 22px 22px" }}>
        <h3 style={{ fontSize: 30, margin: "0 0 4px" }}>{folder.name}</h3>
        <div style={{ font: "400 10.5px/1.5 var(--font-numeric)", color: "var(--color-neutral-600)", marginBottom: 16 }}>
          {(entries ?? []).length} {(entries ?? []).length === 1 ? "entry" : "entries"}
        </div>

        <DocSelectionProvider folderId={folder.id}>
          {(entries ?? []).map((entry) => (
            <div key={entry.id} style={{ padding: "13px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <Icon name="fileText" size={17} className="text-[var(--color-neutral-600)] mt-1" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600 }}>{entry.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                    {(entry.owner as unknown as { full_name: string } | null)?.full_name ?? "Whole family"}
                    {entry.expires_at ? ` · expires ${fmtDate(entry.expires_at)}` : ""}
                    {entry.reference_no ? ` · ref ${entry.reference_no}` : ""}
                  </div>
                  {entry.note && <div style={{ fontSize: 13.5, color: "var(--color-neutral-700)", marginTop: 4 }}>{entry.note}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <Link href={`/family/documents/${folder.id}/${entry.id}/edit`} style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-accent-700)" }}>
                      EDIT
                    </Link>
                    <DocEntryDeleteButton entryId={entry.id} folderId={folder.id} hasFiles={(entry.doc_files ?? []).length > 0} />
                  </div>
                </div>
                <Tag variant={entry.visibility === "family" ? "neutral" : "outline"}>{entry.visibility}</Tag>
              </div>
              {(entry.doc_files ?? []).length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, paddingLeft: 28 }}>
                  {(entry.doc_files ?? []).map((f) => (
                    <DocFileRow key={f.id} id={f.id} folderId={folder.id} fileName={f.file_name} path={f.storage_path} driveViewLink={f.drive_view_link} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </DocSelectionProvider>

        <Link
          href={`/family/documents/new?folder=${folder.id}`}
          className="btn btn-primary btn-block"
          style={{ minHeight: 46, fontSize: 13.5, letterSpacing: ".04em", marginTop: 18 }}
        >
          + NEW ENTRY IN THIS FOLDER
        </Link>
      </div>
    </div>
  );
}
