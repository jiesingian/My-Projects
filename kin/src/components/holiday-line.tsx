import Link from "next/link";
import { Icon } from "@/components/icons";
import { getHolidaysBetween, holidayCountry, holidayLine, mergeHolidays } from "@/lib/holidays";
import { getCurrentMember } from "@/lib/session";
import { getHouseholdSpecialDays } from "@/lib/queries/special-days";

/** "Monday is a holiday — Bonifacio Day", on Today, when one is this week.
 * Its own component and its own fetch (cached for a day, lib/holidays), so
 * Today's page only has to place it. No Done or Skip: like a birthday, it is
 * something to know, not to do. */
export async function HolidayLine() {
  const todayISO = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const weekOut = new Date(Date.parse(`${todayISO}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const me = await getCurrentMember();
  const [pub, own] = await Promise.all([getHolidaysBetween(todayISO, weekOut, holidayCountry(me?.families.country)), me ? getHouseholdSpecialDays(me.family_id, todayISO, weekOut) : Promise.resolve([])]);
  const line = holidayLine(mergeHolidays(pub, own), todayISO);
  if (!line) return null;
  return (
    <p className="kin-holiday">
      <Icon name="sparkle" size={15} />
      <Link href="/planner?seg=calendar&view=month">{line}</Link>
    </p>
  );
}
