import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { DetailHeader } from "@/components/hub-header";
import { CheckInAnswer } from "@/components/check-in-prompt";
import { sinceLabel } from "@/lib/member-card";

export const dynamic = "force-dynamic";

/** Where an "Are you okay?" notification lands (30 September). The person
 * asked answers with one tap; the person who asked sees the answer. Nobody
 * else can open it -- member_checkins is readable only by the two of them. */
export default async function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const { data: c } = await supabase.from("member_checkins").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: people } = await supabase.from("members").select("id, full_name, mobile").in("id", [c.asked_by, c.member_id]);
  const asker = people?.find((p) => p.id === c.asked_by);
  const asked = people?.find((p) => p.id === c.member_id);
  const askerFirst = (asker?.full_name ?? "Someone").split(" ")[0];
  const askedFirst = (asked?.full_name ?? "They").split(" ")[0];
  const iWasAsked = c.member_id === me.id;

  return (
    <div>
      <DetailHeader backHref="/today" eyebrow="Are you okay?" />
      <div style={{ padding: "0 var(--gutter) 1.375rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        {iWasAsked && !c.answer ? (
          <CheckInAnswer id={c.id} askedBy={asker?.full_name ?? "Someone"} />
        ) : iWasAsked ? (
          <p style={{ margin: 0 }}>
            You told {askerFirst} {c.answer === "ok" ? "you're okay" : "to call you"} {sinceLabel(c.answered_at)}.
          </p>
        ) : c.answer ? (
          <>
            <h2 style={{ margin: 0 }}>{c.answer === "ok" ? `${askedFirst} is okay` : `${askedFirst} asked you to call`}</h2>
            <p style={{ margin: 0, color: "var(--color-neutral-700)" }}>Answered {sinceLabel(c.answered_at)}.</p>
            {c.answer === "call_me" && asked?.mobile?.trim() && (
              <a className="btn btn-primary btn-block" href={`tel:${asked.mobile.trim().replace(/[^\d+]/g, "")}`}>
                Call {askedFirst}
              </a>
            )}
          </>
        ) : (
          <p style={{ margin: 0 }}>
            You asked {askedFirst} {sinceLabel(c.asked_at)}. No answer yet — you&rsquo;ll get a notification when they do.
          </p>
        )}
        <Link href="/today" className="btn btn-secondary btn-block">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
