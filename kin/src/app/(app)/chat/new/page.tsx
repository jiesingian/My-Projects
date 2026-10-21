import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { DetailHeader } from "@/components/hub-header";
import { Empty } from "@/components/ui";
import { getCurrentMember } from "@/lib/session";
import { getDirectPeers, type DirectPeer } from "@/lib/queries/chat-rooms";
import { messageablePeople } from "@/lib/new-message";

export const dynamic = "force-dynamic";

/** New message: everyone you can write to one to one right now, your own
 * household first (lib/new-message). Connecting with someone new is the last
 * row, where it used to be the whole page. */
export default async function NewMessagePage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { household, others } = messageablePeople(await getDirectPeers(), me.families.name);

  return (
    <div>
      <DetailHeader backHref="/chat" eyebrow="Chat" trail={[{ label: "Chat", href: "/chat" }, { label: "New message" }]} />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <h2 style={{ fontSize: "1.5rem", margin: "0 0 0.875rem" }}>New message</h2>
        {household.length + others.length === 0 ? (
          <Empty
            icon={<Icon name="message" size={26} />}
            title="Nobody to message one to one yet"
            line="Everyone in the household can always talk in the household chat. To message someone one to one, connect with them first."
          />
        ) : (
          <>
            {household.length > 0 && <PeopleList label="YOUR HOUSEHOLD" people={household} />}
            {others.length > 0 && <PeopleList label="YOUR CONNECTIONS" people={others} />}
          </>
        )}
        <div className="kin-threadlist-actions">
          <Link href="/family/connections" className="kin-threadlist-more">
            <Icon name="users" size={16} />
            <span>Connect with someone new</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function PeopleList({ label, people }: { label: string; people: DirectPeer[] }) {
  return (
    <section aria-label={label.toLowerCase()} style={{ marginBottom: "1rem" }}>
      <div className="kin-eyebrow" style={{ margin: "0 0 0.25rem" }}>
        {label}
      </div>
      <ul className="kin-threadlist">
        {people.map((p) => (
          <li key={p.personId}>
            <Link href={`/chat/dm/${p.personId}`} className="kin-threadrow">
              <span className="kin-threadrow-icon" aria-hidden="true">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- public avatars bucket, like every other avatar
                  <img src={p.avatarUrl} alt="" />
                ) : (
                  <Icon name="message" size={20} />
                )}
              </span>
              <span className="kin-threadrow-main">
                <span className="kin-threadrow-top">
                  <span className="kin-threadrow-title">{p.fullName}</span>
                </span>
                {p.householdName && (
                  <span className="kin-threadrow-bottom">
                    <span className="kin-threadrow-last">{p.householdName}</span>
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
