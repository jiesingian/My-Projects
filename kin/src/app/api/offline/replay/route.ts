import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/session";
import { addBuyItemAction, toggleBuyItemAction } from "@/lib/actions/household";
import { markTodayItemAction } from "@/lib/actions/today";
import { logRoutineAction } from "@/lib/actions/routines";
import { sendMessageAction } from "@/lib/actions/chat";
import { familyDay } from "@/lib/time";
import { MAX_QUEUE, type QueuedOp, type ReplayResult } from "@/lib/offline/types";

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
 *
 * Changes are applied one at a time. The first that fails for a reason that
 * might pass (the database, a timeout) stops the run, and it and everything
 * after it stay queued, so a later message never overtakes an earlier one.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user ? await getCurrentMember() : null;
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
    } catch {
      result = { id: op.id, outcome: "retry" };
    }
    results.push(result);
    if (result.outcome === "retry") break;
  }
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}

async function apply(op: QueuedOp, memberId: string, familyId: string): Promise<ReplayResult> {
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
      const r = await addBuyItemAction({ error: null }, form);
      return r.error ? skip(r.error) : done;
    }

    case "today.mark": {
      if (op.day !== familyDay()) return skip(`${op.label} was for ${op.day}, so it was left as it was.`);
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

    default:
      return skip("Kin doesn't save that offline.");
  }
}
