import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getHubCards } from "@/lib/queries/today";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AssistantConsole } from "@/components/assistant-console";
import { initials } from "@/lib/format";
import { getRoutinesNeedingAttention } from "@/lib/queries/routines";
import { ROUTINE_KIND_META, formatTimeOfDay, type RoutineKind } from "@/lib/routines";
import { RoutineTick, RoutineOccurrences } from "@/components/routine-controls";

export default async function TodayPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");

  const supabase = await createClient();
  const [{ data: members }, hubs, routines] = await Promise.all([
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id).order("created_at"),
    getHubCards(me.family_id, me.families.currency),
    getRoutinesNeedingAttention(me.family_id),
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
      <AssistantConsole memberName={me.full_name.split(" ")[0]} />

      {/* What comes round today, tickable where it stands. */}
      {routines.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ font: "600 13px/1 var(--font-heading)", letterSpacing: ".02em", color: "var(--color-neutral-600)" }}>
              ROUTINES
            </span>
            <Link href="/planner?seg=routines" style={{ fontSize: 12.5, marginLeft: "auto", textDecoration: "none" }}>
              All routines
            </Link>
          </div>
          {routines.map((r) => {
            const meta = ROUTINE_KIND_META[(r.kind as RoutineKind) ?? "other"] ?? ROUTINE_KIND_META.other;
            return (
              <Blueprint key={r.id} style={{ padding: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      flex: "none",
                      borderRadius: 9,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--cal-schedule)",
                      color: "#fff",
                    }}
                  >
                    <Icon name={meta.icon} size={16} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: "600 16px/1.2 var(--font-heading)" }}>{r.title}</div>
                    <div style={{ fontSize: 12.5, color: "var(--color-neutral-600)" }}>
                      {r.today ? (r.timeOfDay ? formatTimeOfDay(r.timeOfDay) : "any time today") : "not today, but behind"}
                      {r.today?.assignee ? ` · ${r.today.assignee.name.split(" ")[0]}&rsquo;s turn` : ""}
                      {r.location ? ` · ${r.location}` : ""}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 9 }}>
                  {r.today && (
                    <RoutineTick
                      routineId={r.id}
                      date={r.today.date}
                      status={r.today.status}
                      cost={r.expectedCost}
                      currency={me.families.currency}
                    />
                  )}
                  <RoutineOccurrences
                    routineId={r.id}
                    overdue={r.overdue}
                    upcoming={r.upcoming}
                    cost={r.expectedCost}
                    currency={me.families.currency}
                  />
                </div>
              </Blueprint>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
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
