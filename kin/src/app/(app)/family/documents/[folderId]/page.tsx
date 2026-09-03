import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { Tag } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { DownloadLink } from "@/components/download-link";
import { DeleteButton } from "@/components/delete-button";
import { deleteDocFileAction } from "@/lib/actions/documents";

export default async function DocFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { folderId } = await params;

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
        <div style={{ font: "400 10.5px/1.5 ui-monospace, Menlo, monospace", color: "var(--color-neutral-600)", marginBottom: 16 }}>
          {(entries ?? []).length} {(entries ?? []).length === 1 ? "entry" : "entries"}
        </div>

        {(entries ?? []).map((entry) => (
          <div key={entry.id} style={{ padding: "13px 0", borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" }}>
            <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
              <Icon name="fileText" size={17} className="text-[var(--color-neutral-600)] mt-1" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600 }}>{entry.title}</div>
                <div style={{ fontSize: 10.5, color: "var(--color-neutral-600)" }}>
                  {(entry.owner as unknown as { full_name: string } | null)?.full_name ?? "Whole family"}
                  {entry.expires_at ? ` · expires ${formatDate(entry.expires_at)}` : ""}
                  {entry.reference_no ? ` · ref ${entry.reference_no}` : ""}
                </div>
                {entry.note && <div style={{ fontSize: 12, color: "var(--color-neutral-700)", marginTop: 4 }}>{entry.note}</div>}
              </div>
              <Tag variant={entry.visibility === "family" ? "neutral" : "outline"}>{entry.visibility}</Tag>
            </div>
            {(entry.doc_files ?? []).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, paddingLeft: 28 }}>
                {(entry.doc_files ?? []).map((f) => (
                  <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <DownloadLink path={f.storage_path} fileName={f.file_name} driveViewLink={f.drive_view_link} />
                    </div>
                    <DeleteButton
                      label={`Delete ${f.file_name}`}
                      confirmText={`Delete "${f.file_name}"? This can't be undone.`}
                      onDelete={async () => {
                        "use server";
                        return deleteDocFileAction(f.id, folder.id);
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

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
