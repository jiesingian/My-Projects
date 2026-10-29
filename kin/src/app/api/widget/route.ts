import { getCurrentMember } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getTodayBriefing, getTodayDoses } from "@/lib/queries/today";
import { reportError } from "@/lib/report-error";
import { familyDay, FAMILY_TZ } from "@/lib/time";
import { widgetSnapshot } from "@/lib/widget";

/** What the Kin iPhone and Android apps' widgets show (lib/widget.ts): the rest of
 * today's doses and plans, as Today lists them, and the To-Buy count. Asked
 * by the app with the member's own session (KinWidgetStore, KinWidgets.java), so
 * everything is read through row-level security as them -- Today's own
 * queries, the same people and plans. Read-only; nothing is stored. */
export async function GET() {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  const me = await getCurrentMember();
  if (!me) return json({ error: "Signed out" }, 401);

  const tz = me.families.time_zone || FAMILY_TZ;
  const supabase = await createClient();
  try {
    const [doses, briefing, toBuy] = await Promise.all([
      getTodayDoses(me),
      getTodayBriefing(me.family_id, me.families.currency, me),
      supabase.from("buy_items").select("id", { count: "exact", head: true }).eq("family_id", me.family_id).eq("checked", false).eq("cleared", false),
    ]);
    if (toBuy.error) throw toBuy.error;
    const now = new Date();
    return json(
      widgetSnapshot({
        now,
        tz,
        day: familyDay(now, tz),
        doses,
        plans: briefing.filter((b) => b.id.startsWith("activity-")),
        toBuy: toBuy.count ?? 0,
      }),
    );
  } catch (err) {
    reportError("Widget: read failed", err);
    return json({ error: "Not now" }, 503);
  }
}
