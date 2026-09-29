import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { DetailHeader } from "@/components/hub-header";
import { searchChats } from "@/lib/queries/chat-search";

export const dynamic = "force-dynamic";

/** "That address Tita sent last month": search every conversation you can
 * read (29 September, suggestion 8). */
export default async function ChatSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { q = "" } = await searchParams;
  const hits = await searchChats({ id: me.id, family_id: me.family_id, person_id: me.person_id, familyName: me.families.name }, q);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      <DetailHeader backHref="/chat" eyebrow="Chat" trail={[{ label: "Chat", href: "/chat" }, { label: "Search" }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <form action="/chat/search" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <input
            name="q"
            type="search"
            className="input"
            defaultValue={q}
            placeholder="Search all your chats"
            aria-label="Search all your chats"
            autoFocus
            style={{ flex: 1, fontSize: "1rem" }}
          />
          <button type="submit" className="btn btn-primary">
            Search
          </button>
        </form>
        {q.trim().length >= 2 && hits.length === 0 && (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>Nothing found for &ldquo;{q}&rdquo;.</p>
        )}
        <ul className="kin-threadlist">
          {hits.map((h) => (
            <li key={h.id}>
              <Link href={h.href} className="kin-threadrow">
                <span className="kin-threadrow-main">
                  <span className="kin-threadrow-top">
                    <span className="kin-threadrow-title">{h.where}</span>
                    <span className="kin-threadrow-time">{fmt(h.at)}</span>
                  </span>
                  <span className="kin-search-hit">
                    <strong>{h.author}:</strong> <Highlighted text={h.body} q={q.trim()} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The found words in bold, with a little around them. */
function Highlighted({ text, q }: { text: string; q: string }) {
  const at = text.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return <>{text.slice(0, 160)}</>;
  const start = Math.max(0, at - 50);
  return (
    <>
      {start > 0 ? "…" : ""}
      {text.slice(start, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length, at + q.length + 100)}
    </>
  );
}
