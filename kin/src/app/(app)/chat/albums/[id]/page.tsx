import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { getAlbum } from "@/lib/queries/chat-albums";
import { AlbumGrid } from "@/components/album-grid";

export const dynamic = "force-dynamic";

export default async function ChatAlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const album = await getAlbum(me.family_id, id);
  if (!album) notFound();
  const manages = album.createdBy === me.id || me.role === "parent";

  return (
    <div>
      <DetailHeader backHref="/chat/albums" eyebrow="Albums" trail={[{ label: "Chat", href: "/chat" }, { label: "Albums", href: "/chat/albums" }, { label: album.name }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h2 className="kin-album-title">{album.name}</h2>
        <p className="kin-album-sub">
          {album.photos.length} {album.photos.length === 1 ? "photo" : "photos"} · from the family chat
        </p>
        <AlbumGrid
          albumId={album.id}
          photos={album.photos.map((p) => ({ id: p.id, url: p.url, canRemove: manages || p.addedBy === me.id }))}
          canDelete={manages}
        />
      </div>
    </div>
  );
}
