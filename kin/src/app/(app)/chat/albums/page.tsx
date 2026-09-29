import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { getAlbums } from "@/lib/queries/chat-albums";

export const dynamic = "force-dynamic";

/** The family chat's albums (28 September): photos kept together so they
 * don't get buried in the thread. Started from the "Keep these in an album?"
 * sheet that follows a photo sent in the chat. */
export default async function ChatAlbumsPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const albums = await getAlbums(me.family_id);

  return (
    <div>
      <DetailHeader backHref="/chat/household" eyebrow="Albums" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        {albums.length === 0 ? (
          <p className="kin-albums-empty">
            No albums yet. Send photos in the family chat and Kin will offer to keep them in one.
          </p>
        ) : (
          <ul className="kin-albums">
            {albums.map((a) => (
              <li key={a.id}>
                <Link href={`/chat/albums/${a.id}`}>
                  <span className="kin-albums-cover">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not a static asset */}
                    {a.coverUrl ? <img src={a.coverUrl} alt="" /> : null}
                  </span>
                  <span className="kin-albums-name">{a.name}</span>
                  <span className="kin-albums-count">
                    {a.count} {a.count === 1 ? "photo" : "photos"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
