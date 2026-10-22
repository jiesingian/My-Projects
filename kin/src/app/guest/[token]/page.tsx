import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { GUEST_TOKEN } from "@/lib/event-guests";
import { sha256, toBase64Url } from "@/lib/security/crypto";
import { readableDay } from "@/lib/time";
import { GuestView } from "./guest-view";
import { reportError } from "@/lib/report-error";

/** One event, for a relative with the link and no account
 * (20261020231000_event_guest_links.sql). The token in the URL is hashed and
 * guest_event() answers with the event's name, dates and host, how many are
 * coming, and the potluck list -- or nothing, the same nothing for a wrong,
 * turned-off or expired link. Anon key only, never the service role; the
 * page never sees a household's rows. Their own answers go through
 * api/guest/[token]. */
export default async function GuestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dead = (
    <>
      <h1>This link isn&rsquo;t working any more</h1>
      <p>It may have been turned off by the host, or the event is more than a week gone. Ask them for a new one.</p>
      <p>
        <Link href="/">What&rsquo;s Kin?</Link>
      </p>
    </>
  );
  if (!GUEST_TOKEN.test(token)) return dead;
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const hash = toBase64Url(sha256(token));
  const [{ data: events, error }, { data: items }] = await Promise.all([supabase.rpc("guest_event", { p_token_hash: hash }), supabase.rpc("guest_potluck", { p_token_hash: hash })]);
  if (error) {
    reportError("Guest link failed", error);
    return (
      <>
        <h1>Kin couldn&rsquo;t open this just now</h1>
        <p>Try again in a minute.</p>
      </>
    );
  }
  const e = events?.[0];
  if (!e) return dead;
  const when = e.end_date && e.end_date > e.event_date ? `${readableDay(e.event_date)} to ${readableDay(e.end_date, { year: true })}` : readableDay(e.event_date, { long: true, year: true });

  return (
    <GuestView
      token={token}
      event={{
        title: e.title,
        when,
        hostName: e.host_name,
        open: e.open,
        coming: e.coming,
        draw: e.draw_id
          ? { id: e.draw_id, title: e.draw_title ?? "Monito-monita", exchangeDate: e.draw_exchange_date ?? "", priceCap: e.draw_price_cap, currency: e.draw_currency ?? "PHP", drawn: !!e.draw_drawn, open: !!e.draw_open }
          : null,
      }}
      potluck={(items ?? []).map((i) => ({ id: i.item_id, label: i.label, wanted: i.wanted, taken: i.taken }))}
    />
  );
}
