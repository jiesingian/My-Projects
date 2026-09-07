import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getHubCards, getTodayBriefing } from "@/lib/queries/today";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";

export default async function TodayPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ data: members }, hubs, brief] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id).order("created_at"),
    getHubCards(me.family_id, me.families.currency),
    getTodayBriefing(me.family_id, me.families.currency),
  ]);

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).toUpperCase();

  return (
    <div style={{ padding: "24px 22px 20px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-accent-700)", marginBottom: 5 }}>
            {todayLabel}
          </div>
          <h2 style={{ fontSize: 30 }}>{me.families.name}</h2>
        </div>
        <div style={{ display: "flex" }}>
          {(members ?? []).map((m) => (
            <div
              key={m.id}
              className="placeholder-fill"
              style={{
                width: 27,
                height: 27,
                marginLeft: -6,
                border: "1px solid var(--color-divider)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                font: "600 13px/1 var(--font-heading)",
                color: "var(--color-neutral-700)",
              }}
            >
              {initials(m.full_name)}
            </div>
          ))}
          <Link href="/settings" className="btn btn-secondary btn-icon" style={{ marginLeft: 10 }}>
            <Icon name="settings" />
          </Link>
        </div>
      </div>

      {/* The briefing. Everything the household has a date on, from every
          hub, in one list — overdue first, then the day in the order it
          happens. This is the answer to "why would anyone open this app on a
          Tuesday", and the hub cards below are demoted to what they always
          were: a way to get somewhere. */}
      <section style={{ marginBottom: 26 }}>
        <h3 className="kin-eyebrow">{brief.length > 0 ? "Needs you today" : "Today"}</h3>

        {brief.length === 0 ? (
          <Blueprint style={{ padding: "18px 15px", display: "flex", alignItems: "center", gap: 12 }}>
            <span className="kin-brief-ico" data-tint="home">
              <Icon name="check" size={17} />
            </span>
            <div>
              <div style={{ font: "600 16px/1.2 var(--font-heading)" }}>Nothing needs you today</div>
              <div style={{ fontSize: 13.5, color: "var(--color-neutral-600)", marginTop: 2 }}>
                No bills due, nothing scheduled, the list is clear.
              </div>
            </div>
          </Blueprint>
        ) : (
          <div className="kin-brief">
            {brief.map((b) => (
              <Link key={b.id} href={b.href} className="kin-brief-row" data-urgent={b.urgent ? "true" : undefined}>
                <span className="kin-brief-ico" data-tint={b.tint}>
                  <Icon name={b.icon} size={17} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="kin-brief-title">{b.title}</span>
                  <span className="kin-brief-meta">{b.meta}</span>
                </span>
                <Icon name="chevronLeft" size={15} className="kin-brief-chev" />
              </Link>
            ))}
          </div>
        )}
      </section>

      <h3 className="kin-eyebrow">Hubs</h3>
      {/* Two up on a phone, as many as fit on a desktop. Two 500px-wide hub
          cards on a monitor is a wider phone, not a desktop — see
          .kin-hubgrid. */}
      <div className="kin-hubgrid">
        {hubs.map((h) => (
          <Link key={h.n} href={h.href} style={{ gridColumn: h.span === "full" ? "1 / -1" : undefined }}>
            <Blueprint style={{ padding: 13, display: "flex", flexDirection: "column", gap: 6, minHeight: 126 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Icon name={h.icon} size={16} className="text-[var(--color-accent-700)]" />
                <span style={{ font: "400 12px/1 var(--font-numeric)", color: "var(--color-neutral-500)", marginLeft: "auto" }}>
                  {h.n}
                </span>
              </div>
              <div style={{ font: "600 21px/1 var(--font-heading)" }}>{h.name}</div>
              <div style={{ fontSize: 13.5, lineHeight: 1.35, color: "var(--color-neutral-800)" }}>{h.primary}</div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ font: "600 20px/1 var(--font-heading)", color: "var(--color-accent-700)" }}>{h.stat}</span>
                <span style={{ fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>
                  {h.statLabel}
                </span>
              </div>
            </Blueprint>
          </Link>
        ))}
      </div>
    </div>
  );
}
