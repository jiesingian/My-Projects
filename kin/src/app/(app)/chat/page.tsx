import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { getCurrentMember } from "@/lib/session";
import { getChatThreads, type ChatThreadSummary } from "@/lib/queries/chat-threads";

export const dynamic = "force-dynamic";

/** Chat opens on a list of conversations (Janine, 29 September): the
 * household's own chat first, then the others, each with its last message and
 * how many are waiting. Tapping one opens it. */
export default async function ChatListPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  // Message, on a profile, used to land on /chat addressed to that person;
  // old links and notifications still do.
  const { to } = await searchParams;
  if (to) redirect(`/chat/household?to=${encodeURIComponent(to)}`);

  const threads = await getChatThreads({ id: me.id, family_id: me.family_id, person_id: me.person_id, familyName: me.families.name });

  return (
    <div style={{ padding: "1.125rem var(--gutter) 1.375rem" }}>
      <div style={{ font: "600 0.8125rem/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: "0.3125rem" }}>CHAT</div>
      <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.875rem" }}>Conversations</h2>

      <ul className="kin-threadlist">
        {threads.map((t) => (
          <li key={t.key}>
            <ThreadRow thread={t} />
          </li>
        ))}
      </ul>

      <div className="kin-threadlist-actions">
        <Link href="/family/connections" className="kin-threadlist-more">
          <Icon name="message" size={16} />
          <span>New message</span>
        </Link>
        <Link href="/chat/groups/new" className="kin-threadlist-more">
          <Icon name="users" size={16} />
          <span>New group</span>
        </Link>
        <Link href="/chat/groups/new?announce=1" className="kin-threadlist-more">
          <Icon name="sparkle" size={16} />
          <span>New channel</span>
        </Link>
      </div>
    </div>
  );
}

function ThreadRow({ thread: t }: { thread: ChatThreadSummary }) {
  const icon = t.kind === "household" ? "house" : t.kind === "dm" ? "message" : t.kind === "channel" ? "sparkle" : "users";
  return (
    <Link href={t.href} className="kin-threadrow" data-unread={t.unread > 0 ? "true" : undefined}>
      <span className="kin-threadrow-icon" aria-hidden="true">
        {t.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public avatars bucket, like every other avatar
          <img src={t.avatarUrl} alt="" />
        ) : (
          <Icon name={icon} size={20} />
        )}
      </span>
      <span className="kin-threadrow-main">
        <span className="kin-threadrow-top">
          <span className="kin-threadrow-title">
            {t.pinned && <span aria-label="Pinned">📌 </span>}
            {t.title}
          </span>
          {t.muted && (
            <span className="kin-threadrow-muted" aria-label="Muted">
              🔕
            </span>
          )}
          {t.last && <span className="kin-threadrow-time">{when(t.last.at)}</span>}
        </span>
        <span className="kin-threadrow-bottom">
          <span className="kin-threadrow-last">{t.last ? `${t.last.author}: ${t.last.body}` : t.subtitle}</span>
          {t.unread > 0 && (
            <span className="kin-threadrow-badge" data-muted={t.muted || undefined} aria-label={`${t.unread} unread${t.mentioned ? ", you were mentioned" : ""}`}>
              {t.mentioned ? "@ " : ""}
              {t.unread > 99 ? "99+" : t.unread}
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

/** Today as a time, this week as a day, otherwise a date -- the way every
 * phone's message list reads. Manila time, like the rest of the app. */
function when(iso: string): string {
  const d = new Date(iso);
  const tz = "Asia/Manila";
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const now = new Date();
  if (day(d) === day(now)) return d.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86400000) return d.toLocaleDateString("en-US", { timeZone: tz, weekday: "short" });
  return d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
}
