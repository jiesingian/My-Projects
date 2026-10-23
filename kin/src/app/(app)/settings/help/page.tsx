import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/session";
import { inKidView } from "@/lib/kid-view";
import { DetailHeader } from "@/components/hub-header";
import { Tag } from "@/components/ui";
import { HELP_GUIDE, HELP_TAG_LABELS, HELP_TABS_HIDDEN_IN_KID_VIEW, HELP_GROUPS_HIDDEN_IN_KID_VIEW } from "@/lib/help-guide";

/** Settings -> Help (23 October): every feature, tab by tab, folded to its
 * name until opened -- what it is, how to use it, pros, cons and tips. The
 * words live in lib/help-guide.ts. Kid view sees only the tabs it can open. */
export default async function HelpPage() {
  const me = await getCurrentMember();
  if (!me) redirect("/onboarding/profile");
  const kid = inKidView(me);
  const tabs = HELP_GUIDE.filter((t) => !kid || !HELP_TABS_HIDDEN_IN_KID_VIEW.includes(t.id)).map((t) => ({
    ...t,
    groups: t.groups.filter((g) => !kid || !HELP_GROUPS_HIDDEN_IN_KID_VIEW.includes(g.title)),
  }));

  const sub = { fontSize: "0.71875rem", letterSpacing: ".06em", textTransform: "uppercase" as const, fontWeight: 600, margin: "0.625rem 0 0.25rem" };
  const list = { margin: 0, paddingLeft: "1.125rem", fontSize: "0.875rem", lineHeight: 1.45, display: "grid", gap: "0.25rem" };

  return (
    <div>
      <DetailHeader backHref="/settings" eyebrow="Help" />
      <div style={{ padding: "0 var(--gutter) 1.375rem" }}>
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.45, color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>
          Every feature in Kin, tab by tab. Tap one for what it is, how to use it, and its pros, cons and tips.
        </p>

        <nav aria-label="Tabs" style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "0.5rem" }}>
          {tabs.map((t) => (
            <a key={t.id} href={`#help-${t.id}`} className="chip">
              {t.name}
            </a>
          ))}
        </nav>

        {tabs.map((t) => (
          <section key={t.id} id={`help-${t.id}`} style={{ scrollMarginTop: "4rem", marginTop: "1.25rem" }}>
            <h2 style={{ font: "600 1.25rem/1.2 var(--font-heading)", margin: "0 0 0.25rem" }}>{t.name}</h2>
            <p style={{ fontSize: "0.84375rem", lineHeight: 1.45, color: "var(--color-neutral-600)", margin: "0 0 0.5rem" }}>{t.intro}</p>
            {t.groups.map((g) => (
              <div key={g.title} style={{ marginTop: "0.75rem" }}>
                <div style={{ fontSize: "0.75rem", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-accent-700)", fontWeight: 600, marginBottom: "0.375rem" }}>
                  {g.title}
                </div>
                {g.features.map((f) => (
                  <details key={f.name} className="blueprint" style={{ padding: "0.625rem 0.875rem", marginBottom: "0.5rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.35, minHeight: 28 }}>
                      {f.name}
                      {f.tags.map((tag) => (
                        <span key={tag} style={{ marginLeft: "0.375rem" }}>
                          <Tag variant={tag === "plus" ? "accent" : "outline"}>{HELP_TAG_LABELS[tag]}</Tag>
                        </span>
                      ))}
                    </summary>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.45, margin: "0.5rem 0 0" }}>{f.what}</p>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.45, margin: "0.5rem 0 0", color: "var(--color-neutral-700)" }}>
                      <strong>How to use:</strong> {f.how}
                    </p>
                    <div style={{ ...sub, color: "var(--color-success-700, var(--color-accent-700))" }}>Pros</div>
                    <ul style={list}>
                      {f.pros.map((x) => <li key={x}>{x}</li>)}
                    </ul>
                    {f.cons.length > 0 && (
                      <>
                        <div style={{ ...sub, color: "var(--color-neutral-700)" }}>Cons</div>
                        <ul style={list}>
                          {f.cons.map((x) => <li key={x}>{x}</li>)}
                        </ul>
                      </>
                    )}
                    {f.tips.length > 0 && (
                      <>
                        <div style={{ ...sub, color: "var(--color-accent-700)" }}>Tips</div>
                        <ul style={list}>
                          {f.tips.map((x) => <li key={x}>{x}</li>)}
                        </ul>
                      </>
                    )}
                  </details>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
