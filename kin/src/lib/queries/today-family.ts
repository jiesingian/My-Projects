import { householdZone } from "@/lib/household-zone";
import { createClient } from "@/lib/supabase/server";
import { addDays, familyDay } from "@/lib/time";
import { isGrownUp } from "@/lib/roles";
import { getOpenCards } from "@/lib/queries/time-capsules";
import { getEmergencyOwnerView } from "@/lib/queries/vault-emergency";
import { getFeedOccasions } from "@/lib/queries/family-links";
import { cardRows, documentRows, failedMessageRows, giftDrawSoon, occasionRows, vaultRequestRows } from "@/lib/today-family";
import type { BriefItem } from "@/lib/queries/today";

export type SosOpen = { id: string; name: string; minutesAgo: number };

/** The rest of the household's part of Today (23 October), read under the
 * member's own policies: documents and the vault are the grown-ups'; a card
 * is signed by anyone with a login; a scheduled message is its sender's. */
export async function getTodayFamily(me: { id: string; role: string; family_id: string }): Promise<{ today: BriefItem[]; soon: BriefItem[]; sos: SosOpen[] }> {
  const supabase = await createClient();
  const tz = await householdZone();
  const today = familyDay(new Date(), tz);
  const grownUp = isGrownUp(me.role);
  const canSign = grownUp || me.role === "child_self";
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

  const [{ data: docs }, cards, { data: failed }, vault, occasions, { data: draws }, { data: alerts }, { data: members }] = await Promise.all([
    grownUp
      ? supabase
          .from("doc_entries")
          .select("id, title, doc_type, expires_at, folder_id")
          .eq("family_id", me.family_id)
          .not("expires_at", "is", null)
          .gte("expires_at", `${addDays(today, -30) ?? today}T00:00:00Z`)
          .lt("expires_at", `${addDays(today, 31) ?? today}T00:00:00Z`)
      : Promise.resolve({ data: [] }),
    canSign ? getOpenCards() : Promise.resolve([]),
    supabase.from("scheduled_messages").select("id, body, thread, send_at").not("failed", "is", null).gte("send_at", `${addDays(today, -7) ?? today}T00:00:00Z`),
    grownUp ? getEmergencyOwnerView(me.family_id, false).then((v) => v.requests) : Promise.resolve([]),
    getFeedOccasions(me.id, me.family_id),
    supabase.from("gift_draws").select("id, title, exchange_date").eq("family_id", me.family_id).gte("exchange_date", today).lte("exchange_date", addDays(today, 7) ?? today),
    // Someone else's SOS, pressed in the last day and not resolved; the
    // policy shows a grown-up everyone's, a child their own only.
    supabase.from("sos_alerts").select("id, member_id, created_at").eq("family_id", me.family_id).is("resolved_at", null).neq("member_id", me.id).gte("created_at", dayAgo),
    supabase.from("members").select("id, full_name").eq("family_id", me.family_id),
  ]);

  const names = new Map((members ?? []).map((m) => [m.id, m.full_name.split(" ")[0]]));
  const documents = documentRows(docs ?? [], today);
  return {
    today: [...vaultRequestRows(vault), ...failedMessageRows(failed ?? []), ...documents.today, ...cardRows(cards, today), ...occasionRows(occasions)],
    soon: [...documents.soon, ...giftDrawSoon(draws ?? [], today)],
    sos: (alerts ?? []).map((a) => ({ id: a.id, name: names.get(a.member_id) ?? "Someone", minutesAgo: Math.max(0, Math.round((Date.now() - Date.parse(a.created_at)) / 60_000)) })),
  };
}
