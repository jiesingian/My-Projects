import Link from "next/link";
import { Icon } from "@/components/icons";
import { getMemberLocations } from "@/lib/queries/family";
import { whereLabel } from "@/lib/location-places";
import { familyTime } from "@/lib/time";

/** Today's "who's where" (roadmap item 10): one line per person who shares
 * their location -- at a saved place, out, or paused -- with when Kin last
 * heard. Nothing at all when nobody shares, so a household that never turns
 * it on never sees it. The board itself, with the switches, is on Family. */
export async function WhosWhere({ familyId, meId, tz }: { familyId: string; meId: string; tz: string }) {
  const people = (await getMemberLocations(familyId)).filter((p) => p.sharing);
  if (people.length === 0) return null;
  const now = new Date();

  return (
    <section style={{ marginBottom: "1.625rem" }} aria-label="Who's where">
      <h3 className="kin-eyebrow">Who&rsquo;s where</h3>
      <Link href="/family?seg=quicklinks" className="kin-whoswhere" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
        {people.map((p) => {
          const where = whereLabel(p, now);
          const at = where && where !== "Paused" && p.updatedAt && p.lat !== null ? familyTime(new Date(p.updatedAt), tz).toLowerCase() : null;
          return (
            <div key={p.memberId} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.25rem 0", fontSize: "0.875rem" }}>
              <Icon name="mapPin" size={14} style={{ color: where === "Paused" ? "var(--color-neutral-600)" : "var(--color-accent-700)", flex: "none" }} />
              <span style={{ fontWeight: 500 }}>{p.memberId === meId ? "You" : p.name.split(" ")[0]}</span>
              <span style={{ color: "var(--color-neutral-700)" }}>
                {where}
                {at ? ` · ${at}` : ""}
              </span>
            </div>
          );
        })}
      </Link>
    </section>
  );
}
