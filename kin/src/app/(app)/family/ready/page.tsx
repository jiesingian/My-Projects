import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import { DetailHeader } from "@/components/hub-header";
import { AskEveryoneButton, ReadyChecklist, TyphoonSwitch } from "@/components/typhoon-ready";

/** Family -> Get ready (29 October): Typhoon mode's switch, the household's
 * checklist, and what to do from here -- the emergency card, a brownout on
 * the calendar, and asking everyone if they're okay. */
export default async function ReadyPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const supabase = await createClient();
  const { data: items } = await supabase.from("ready_items").select("id, label, done_at, sort, created_at").eq("family_id", me.family_id).order("sort").order("created_at");
  const grownUp = isGrownUp(me.role);
  const link = { display: "flex", alignItems: "center", justifyContent: "center", minHeight: "2.75rem" } as const;

  return (
    <div>
      <DetailHeader backHref="/family" eyebrow="Get ready" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.875rem" }}>
          For typhoons and long brownouts. Get the house ready together, then keep track of each other until it passes.
        </p>
        <TyphoonSwitch on={!!me.families.typhoon_mode_since} canChange={grownUp} />
        <h2 style={{ font: "600 1.0625rem/1.2 var(--font-heading)", margin: "1rem 0 0.5rem" }}>Checklist</h2>
        <ReadyChecklist items={items ?? []} />
        <h2 style={{ font: "600 1.0625rem/1.2 var(--font-heading)", margin: "1.25rem 0 0.5rem" }}>When it comes</h2>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {grownUp && <AskEveryoneButton block />}
          <Link href={`/family/members/${me.id}/emergency`} className="btn btn-secondary" style={link}>
            Emergency card
          </Link>
          <Link href="/planner/add?type=event&title=Brownout" className="btn btn-secondary" style={link}>
            Put a brownout on the calendar
          </Link>
        </div>
      </div>
    </div>
  );
}
