import { createClient } from "@/lib/supabase/server";
import { familyDay } from "@/lib/time";

export type TimeCapsule = {
  id: string;
  writerMemberId: string | null;
  writerName: string;
  recipientMemberId: string;
  recipientName: string;
  title: string;
  body: string;
  /** The day it opens -- or, for an "open when" letter, the day it was
   * opened ("" while it waits). */
  opensOn: string;
  occasion: string;
  openToSign: boolean;
  /** "Open when..." letters: the moment, and when the recipient opened it. */
  openWhen: string | null;
  openedAt: string | null;
  createdAt: string;
  sealed: boolean;
};

/** A special day: one person, one date, and every opened letter written to
 * them for it, from whoever wrote one. It shows in the journal under that
 * person's own entry for the day, or on its own if they wrote none. */
export type LetterDay = {
  key: string;
  recipientMemberId: string;
  recipientName: string;
  opensOn: string;
  occasion: string;
  letters: TimeCapsule[];
};

/** An envelope waiting for the reader: who it's from, when it opens and for
 * what -- never a word of it (my_sealed_letters, 20261007160100). */
export type SealedEnvelope = { id: string; writerName: string; opensOn: string; occasion: string };

/** Every letter this person may read: the ones they wrote, and the
 * opened ones written to them. The table's own rules decide which
 * (20261007160050_time_capsules_recipient_only.sql); nothing is filtered here. */
export async function getTimeCapsules(familyId: string, opts: { openingOn?: string; timeZone?: string } = {}): Promise<TimeCapsule[]> {
  const supabase = await createClient();
  let q = supabase
    .from("time_capsules")
    .select("id, writer_member_id, writer_name, recipient_member_id, title, body, opens_on, occasion, open_to_sign, open_when, opened_at, created_at, recipient:members!time_capsules_recipient_member_id_fkey(full_name)")
    .eq("family_id", familyId)
    .order("opens_on", { ascending: false })
    .order("created_at");
  if (opts.openingOn) q = q.eq("opens_on", opts.openingOn);
  const { data } = await q;
  const today = familyDay(new Date(), opts.timeZone);
  return (data ?? []).map((r) => {
    const openedOn = r.opened_at ? familyDay(new Date(r.opened_at), opts.timeZone) : "";
    const opensOn = r.open_when ? openedOn : (r.opens_on ?? "");
    return {
    id: r.id,
    writerMemberId: r.writer_member_id,
    writerName: r.writer_name,
    recipientMemberId: r.recipient_member_id,
    recipientName: (r.recipient as { full_name: string } | null)?.full_name ?? "",
    title: r.title,
    body: r.body,
    opensOn,
    occasion: r.open_when ? `Open when ${r.open_when}` : r.occasion,
    openToSign: r.open_to_sign,
    openWhen: r.open_when,
    openedAt: r.opened_at,
    createdAt: r.created_at,
    sealed: r.open_when ? !r.opened_at : opensOn > today,
  };
  });
}

/** A card being signed in the household, for anyone but the reader: whose
 * day, when, and who has signed -- never a word of a note (open_cards,
 * 20261007170000). */
export type OpenCard = { recipientMemberId: string; recipientName: string; opensOn: string; occasion: string; signers: string[]; signedByMe: boolean };

export async function getOpenCards(): Promise<OpenCard[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("open_cards");
  return (data ?? []).map((r) => ({
    recipientMemberId: r.recipient_member_id,
    recipientName: r.recipient_name,
    opensOn: r.opens_on,
    occasion: r.occasion,
    signers: r.signers ?? [],
    signedByMe: r.signed_by_me,
  }));
}

/** "Open when..." envelopes waiting for the reader (my_open_when_letters,
 * 20261007180000): who from and the moment, never a word of it. */
export type OpenWhenEnvelope = { id: string; writerName: string; openWhen: string };

export async function getOpenWhenForMe(): Promise<OpenWhenEnvelope[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_open_when_letters");
  return (data ?? []).map((r) => ({ id: r.id, writerName: r.writer_name, openWhen: r.open_when }));
}

export async function getSealedForMe(): Promise<SealedEnvelope[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_sealed_letters");
  return (data ?? []).map((r) => ({ id: r.id, writerName: r.writer_name, opensOn: r.opens_on, occasion: r.occasion }));
}

/** Opened letters, gathered into their special days, newest first. */
export function letterDays(letters: TimeCapsule[]): LetterDay[] {
  const days = new Map<string, LetterDay>();
  for (const l of letters) {
    if (l.sealed) continue;
    // An "open when" letter is its own moment, on the day it was opened.
    const key = l.openWhen ? `${l.recipientMemberId}-${l.opensOn}-w${l.id}` : `${l.recipientMemberId}-${l.opensOn}`;
    const day = days.get(key) ?? { key, recipientMemberId: l.recipientMemberId, recipientName: l.recipientName, opensOn: l.opensOn, occasion: "", letters: [] };
    day.letters.push(l);
    if (!day.occasion && l.occasion) day.occasion = l.occasion;
    days.set(key, day);
  }
  return [...days.values()].sort((a, b) => (a.opensOn < b.opensOn ? 1 : a.opensOn > b.opensOn ? -1 : 0));
}
