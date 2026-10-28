import { householdZone } from "@/lib/household-zone";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { addBuyItemAction, toggleBuyItemAction } from "@/lib/actions/household";
import { markTodayItemAction } from "@/lib/actions/today";
import { approveRoutineLogAction, logRoutineAction, rejectRoutineLogAction } from "@/lib/actions/routines";
import { setDoseTakenAction } from "@/lib/actions/health-care";
import { recordMovementAction, transferAction } from "@/lib/actions/wealth";
import { choreAnswerVerdict, choreLogVerdict, doseVerdict, moneyIds, moneyVerdict, type Verdict } from "@/lib/offline/rules";
import { sendMessageAction } from "@/lib/actions/chat";
import { familyDay } from "@/lib/time";
import { MAX_QUEUE, type QueuedOp, type ReplayResult } from "@/lib/offline/types";
import { reportError } from "@/lib/report-error";

/** Changes made offline, sent in the order they were made (lib/offline/queue).
 *
 * A route rather than the server actions themselves, because a phone that was
 * offline across a deploy holds the old build's action ids, which the new
 * build no longer answers. This address does not move. Each change still goes
 * through the same action a tap online would, in the member's own session,
 * so row-level security and every check in those actions apply unchanged.
 *
 * THE RULES WHEN SOMETHING CHANGED IN THE MEANTIME
 *
 * - A tick or untick: the later one wins. If someone changed the item after
 *   the offline tap (its checked_at is newer), theirs stands and this one is
 *   skipped. An item removed or cleared since is skipped.
 * - Marking a Today item done: only on the day it was marked for. If someone
 *   already answered it (done or skipped), their answer stands.
 * - Adding an item, or a household chat message: always added, once. The id
 *   made on the phone is the row's id, so a second send finds the first.
 * - A medicine dose, a chore done or skipped from the Planner, and a yes or no
 *   to a chore waiting for approval (19 October): lib/offline/rules.ts, the
 *   same rules -- the later tick wins, an answer already given stands.
 * - Money in, out or a transfer from Move money (28 October): recorded once,
 *   as of the date it was entered. The ids made on the phone are the ledger
 *   rows' ids, so one already there is not recorded again (moneyVerdict),
 *   and the action itself refuses a second row with the same id.
 *
 * Changes are applied one at a time. The first that fails for a reason that
 * might pass (the database, a timeout) stops the run, and it and everything
 * after it stay queued, so a later message never overtakes an earlier one.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  // One auth round trip: getCurrentMember asks for the user itself, and its
  // member row carries the auth id.
  const me = await getCurrentMember();
  const user = me?.auth_user_id ? { id: me.auth_user_id } : null;
  if (!user || !me) return NextResponse.json({ error: "signed-out" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { userId?: string; ops?: QueuedOp[] } | null;
  // The queue belongs to whoever made it. Someone else signed in on this
  // phone does not get to send another person's changes as themselves.
  if (!body || body.userId !== user.id) return NextResponse.json({ error: "not-yours" }, { status: 409 });
  const ops = Array.isArray(body.ops) ? body.ops.slice(0, MAX_QUEUE) : [];

  const results: ReplayResult[] = [];
  for (const op of ops) {
    if (!op || typeof op.id !== "string" || !UUID.test(op.id)) continue;
    let result: ReplayResult;
    try {
      result = await apply(op, me.id, me.family_id);
    } catch (err) {
      reportError("Offline change could not be replayed", err, op.kind);
      result = { id: op.id, outcome: "retry" };
    }
    results.push(result);
    if (result.outcome === "retry") break;
  }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}

async function apply(op: QueuedOp, memberId: string, familyId: string): Promise<ReplayResult> {
  const tz = await householdZone();
  const supabase = await createClient();
  const done = { id: op.id, outcome: "applied" as const };
  const skip = (note: string): ReplayResult => ({ id: op.id, outcome: "skipped", note });

  switch (op.kind) {
    case "buy.toggle": {
      if (!UUID.test(op.itemId)) return skip("That item isn't on the list.");
      const { data: item, error } = await supabase
        .from("buy_items")
        .select("checked, checked_at, cleared")
        .eq("id", op.itemId)
        .eq("family_id", familyId)
        .maybeSingle();
      if (error) return { id: op.id, outcome: "retry" };
      if (!item || item.cleared) return skip(`${op.label} is no longer on the list.`);
      if (item.checked === op.checked) return done;
      // Somebody ticked it after you unticked it: the later tap stands.
      if (item.checked_at && item.checked_at > op.at) return skip(`${op.label} was changed by someone after you.`);
      await toggleBuyItemAction(op.itemId, op.checked === true);
      return done;
    }

    case "buy.add": {
      const form = new FormData();
      form.set("name", String(op.name ?? ""));
      form.set("id", op.id);
      for (const field of ["quantity", "unit", "section"] as const) {
        if (typeof op[field] === "string") form.set(field, op[field]);
      }
      if (typeof op.eventId === "string") form.set("event_id", op.eventId);
      if (typeof op.storeKind === "string") form.set("store_kind", op.storeKind);
      if (typeof op.storeName === "string") form.set("store_name", op.storeName);
      if (typeof op.budget === "string") form.set("budget", op.budget);
      const r = await addBuyItemAction({ error: null }, form);
      return r.error ? skip(r.error) : done;
    }

    case "today.mark": {
      if (op.day !== familyDay(new Date(), tz)) return skip(`${op.label} was for ${op.day}, so it was left as it was.`);
      const chore = /^chore-([0-9a-f-]{36})$/i.exec(op.key);
      if (chore) {
        const date = op.date ?? op.day;
        const { data: logged, error } = await supabase
          .from("routine_log")
          .select("logged_by")
          .eq("routine_id", chore[1])
          .eq("occurrence_date", date)
          .maybeSingle();
        if (error) return { id: op.id, outcome: "retry" };
        if (logged) return logged.logged_by === memberId ? done : skip(`${op.label} was already answered by someone else.`);
        const r = await logRoutineAction({ routineId: chore[1], date, status: "done", note: null });
        return r.error ? skip(r.error) : done;
      }
      const { data: mark, error } = await supabase
        .from("today_marks")
        .select("marked_by")
        .eq("family_id", familyId)
        .eq("item_key", op.key)
        .eq("day", op.day)
        .maybeSingle();
      if (error) return { id: op.id, outcome: "retry" };
      if (mark) return mark.marked_by === memberId ? done : skip(`${op.label} was already answered by someone else.`);
      const r = await markTodayItemAction(op.key, "done");
      return r.error ? skip(r.error) : done;
    }

    case "dose.set": {
      if (!UUID.test(op.medicineId) || !UUID.test(op.memberId) || !DAY.test(op.day) || !/^\d{2}:\d{2}$/.test(op.time)) return skip("That dose could not be found.");
      const { data: row, error } = await supabase
        .from("health_medicine_doses")
        .select("taken_at")
        .eq("medicine_id", op.medicineId)
        .eq("dose_date", op.day)
        .eq("dose_time", op.time)
        .maybeSingle();
      if (error) return { id: op.id, outcome: "retry" };
      return settle(op.id, doseVerdict({ at: op.at, taken: op.taken === true, label: op.label }, row), () =>
        setDoseTakenAction({ medicineId: op.medicineId, memberId: op.memberId, day: op.day, time: op.time, taken: op.taken === true }),
      );
    }

    case "chore.log": {
      if (!UUID.test(op.routineId) || !DAY.test(op.date) || (op.status !== "done" && op.status !== "skipped")) return skip("That chore could not be found.");
      const { data: logged, error } = await supabase.from("routine_log").select("logged_by, status").eq("routine_id", op.routineId).eq("occurrence_date", op.date).maybeSingle();
      if (error) return { id: op.id, outcome: "retry" };
      return settle(op.id, choreLogVerdict(op, logged, memberId), () => logRoutineAction({ routineId: op.routineId, date: op.date, status: op.status, note: null }));
    }

    case "chore.answer": {
      if (!UUID.test(op.routineId) || !DAY.test(op.date)) return skip("That chore could not be found.");
      const { data: log, error } = await supabase
        .from("routine_log")
        .select("approval, approved_by")
        .eq("routine_id", op.routineId)
        .eq("occurrence_date", op.date)
        .eq("family_id", familyId)
        .maybeSingle();
      if (error) return { id: op.id, outcome: "retry" };
      return settle(op.id, choreAnswerVerdict({ approve: op.approve === true, label: op.label }, log, memberId), () =>
        op.approve === true ? approveRoutineLogAction(op.routineId, op.date) : rejectRoutineLogAction(op.routineId, op.date),
      );
    }

    case "chat.send": {
      // Tags and the answered message travel as the composer had them;
      // sendMessageAction keeps only tags of people in this household, and
      // the database refuses a reply to another household's message.
      const mentions = Array.isArray(op.mentions) ? op.mentions.filter((m): m is string => typeof m === "string" && UUID.test(m)).slice(0, 20) : [];
      const replyTo = typeof op.replyTo === "string" && UUID.test(op.replyTo) ? op.replyTo : null;
      // Files the phone uploaded before sending (lib/offline/sync). The
      // action refuses any path outside this household's chat folder.
      const attachments = (Array.isArray(op.uploaded) ? op.uploaded : [])
        .filter((a) => a && typeof a.storagePath === "string" && typeof a.fileName === "string" && typeof a.mimeType === "string" && Number.isFinite(a.sizeBytes))
        .slice(0, 10)
        .map((a) => ({ storagePath: a.storagePath, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: Number(a.sizeBytes), transcript: typeof a.transcript === "string" ? a.transcript : undefined }));
      const r = await sendMessageAction({ body: String(op.body ?? ""), mentions, replyTo, attachments, clientId: op.id });
      return r.error ? skip(r.error) : done;
    }

    case "money.record":
    case "money.transfer": {
      const ids = moneyIds(op);
      if (!ids.every((id) => UUID.test(id))) return skip("That entry could not be read, so nothing was recorded.");
      const { data: found, error } = await supabase.from("wealth_transactions").select("id").in("id", ids).eq("family_id", familyId);
      if (error) return { id: op.id, outcome: "retry" };
      const recorded = (found ?? []).map((r) => r.id);
      // Never through a banking app: that needs the app, and so a signal.
      const run =
        op.kind === "money.transfer"
          ? () => transferAction({ fromAccountId: op.fromAccountId, toAccountId: op.toAccountId, amount: Number(op.amount), note: String(op.note ?? ""), occurredAt: op.occurredAt, viaApp: false, clientIds: { out: op.id, in: op.inId } })
          : () =>
              recordMovementAction({
                accountId: op.accountId,
                direction: op.direction === "in" ? "in" : "out",
                amount: Number(op.amount),
                particulars: String(op.particulars ?? ""),
                category: op.category ?? null,
                occurredAt: op.occurredAt,
                viaApp: false,
                againstTable: op.againstTable ?? null,
                againstId: op.againstId ?? null,
                principal: op.principal ?? null,
                assetUse: op.assetUse,
                assetItemKind: op.assetItemKind,
                whose: op.whose,
                clientId: op.id,
              });
      // What did not save says which entry it was: money the person thinks
      // is recorded must not vanish into a bare reason.
      const r = await settle(op.id, moneyVerdict(op, recorded), run);
      return r.outcome === "skipped" && r.note ? { ...r, note: `${op.label} wasn't recorded: ${r.note}` } : r;
    }

    default:
      return skip("Kin doesn't save that offline.");
  }
}

/** Applies a change the rules said to apply, through the same action a tap
 * online would use; otherwise reports what the rules decided. */
async function settle(id: string, verdict: Verdict, run: () => Promise<{ error: string | null }>): Promise<ReplayResult> {
  if (!verdict.apply) return { id, outcome: verdict.outcome, note: verdict.note };
  const r = await run();
  return r.error ? { id, outcome: "skipped", note: r.error } : { id, outcome: "applied" };
}
