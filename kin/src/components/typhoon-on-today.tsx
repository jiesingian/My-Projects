import Link from "next/link";
import { Icon } from "@/components/icons";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isGrownUp } from "@/lib/roles";
import { readyProgress } from "@/lib/typhoon";
import { AskEveryoneButton } from "@/components/typhoon-ready";

/** Typhoon mode on Today (29 October): while a grown-up has it switched on,
 * Today leads with the checklist's progress, asking everyone if they're
 * okay, and the emergency card. Its own fetch, like ChristmasOnToday. */
export async function TyphoonOnToday() {
  const me = await getCurrentMember();
  if (!me || !me.families.typhoon_mode_since) return null;
  const supabase = await createClient();
  const { data: items } = await supabase.from("ready_items").select("id, label, done_at").eq("family_id", me.family_id);
  const p = readyProgress(items ?? []);
  const small = { minHeight: "2.25rem", fontSize: "0.8125rem", padding: "0 0.75rem", display: "inline-flex", alignItems: "center" } as const;
  return (
    <section aria-labelledby="typhoon-today" className="blueprint" style={{ padding: "0.75rem 0.9375rem", marginBottom: "0.875rem", borderLeft: "3px solid var(--cal-money)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Icon name="cloudSun" size={18} />
        <h2 id="typhoon-today" style={{ font: "600 1.0625rem/1.2 var(--font-heading)", margin: 0, flex: 1 }}>
          Typhoon mode
        </h2>
        <Link href="/family/ready" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", fontWeight: 500 }}>
          {p.all ? "All ready" : p.line}
        </Link>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.625rem" }}>
        <Link href="/family/ready" className="btn btn-primary" style={small}>
          Checklist
        </Link>
        {isGrownUp(me.role) && <AskEveryoneButton />}
        <Link href={`/family/members/${me.id}/emergency`} className="btn btn-secondary" style={small}>
          Emergency card
        </Link>
      </div>
    </section>
  );
}
