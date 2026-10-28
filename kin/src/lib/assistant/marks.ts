/** The marks Ask Kin's rule layer may make (28 October, fourth PR): a bill
 * paid, a list item ticked or unticked, a chore done or skipped. Each goes
 * through the server action the screen itself uses (payBillAction,
 * settleBillOutsideKinAction, toggleBuyItemAction, logRoutineAction), so
 * the validation, the ledger entry, the approval a child's tick waits for
 * and the pushes stay in one place each.
 *
 * Rule-only: these are not in ASSISTANT_TOOLS, so the model is never handed
 * them. A rule names one record exactly (the matcher asked which when two
 * answered to a word), and the executor refuses rather than guesses: a name
 * that fits two records comes back as `ambiguous` for the rule to ask about,
 * and a name that fits none as an error. Nothing here deletes. */

import { createClient } from "@/lib/supabase/server";
import type { CurrentMember } from "@/lib/session";
import { paidFromVisibleFilter } from "@/lib/wealth";
import { familyDay } from "@/lib/time";
import { payBillAction, settleBillOutsideKinAction } from "@/lib/actions/wealth";
import { toggleBuyItemAction } from "@/lib/actions/household";
import { logRoutineAction } from "@/lib/actions/routines";
import { getRoutines } from "@/lib/queries/routines";
import { isGrownUp } from "@/lib/roles";

export const MARK_TOOLS = ["mark_bill_paid", "tick_list_item", "log_chore"] as const;
export type MarkTool = (typeof MARK_TOOLS)[number];

export function isMarkTool(name: string): name is MarkTool {
  return (MARK_TOOLS as readonly string[]).includes(name);
}

type Json = Record<string, unknown>;

function str(input: Json, key: string): string | null {
  const v = input[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** The records whose name answers to `wanted`: an exact name first, else
 * every name containing it (or contained by it). */
function pickByName<T extends { name: string }>(rows: T[], wanted: string): T[] {
  const w = wanted.toLowerCase().trim();
  const exact = rows.filter((r) => r.name.toLowerCase() === w);
  if (exact.length > 0) return exact;
  return rows.filter((r) => r.name.toLowerCase().includes(w) || (w.length > 3 && w.includes(r.name.toLowerCase())));
}

const distinctNames = <T extends { name: string }>(rows: T[]) => [...new Set(rows.map((r) => r.name))];

/** Runs one mark for the member who asked. The same compact JSON shape as
 * runAssistantTool: `{ error }` on a refusal, `{ ambiguous: [names] }` when
 * the rule has to ask which, else what was done. */
export async function runMarkTool(name: string, rawInput: unknown, me: CurrentMember): Promise<string> {
  const input = (rawInput ?? {}) as Json;
  const supabase = await createClient();
  const familyId = me.family_id;
  const done = (payload: unknown) => JSON.stringify(payload);
  const fail = (message: string) => JSON.stringify({ error: message });

  switch (name) {
    case "mark_bill_paid": {
      const wanted = str(input, "bill_name");
      if (!wanted) return fail("Which bill? Give me its name.");
      const accountName = str(input, "account_name");
      const outside = input.outside === true;
      if (!accountName && !outside) return fail("Paid from which account, or outside Kin?");
      // The bills the member may see (someone else's private account's are
      // not theirs to settle either), still open.
      const visible = paidFromVisibleFilter(((await supabase.from("accounts").select("id").eq("family_id", familyId)).data ?? []).map((a) => a.id));
      const { data: bills } = await supabase.from("bills").select("id, name, amount, due_date, status").eq("family_id", familyId).or(visible).in("status", ["unpaid", "scheduled"]);
      const hits = pickByName(bills ?? [], wanted).sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
      if (hits.length === 0) return fail(`No unpaid bill called "${wanted}". Paid and other bills are under Wealth → Expenses.`);
      const names = distinctNames(hits);
      if (names.length > 1) return done({ ambiguous: names });
      const bill = hits[0];
      const amount = typeof input.amount === "number" && input.amount > 0 ? input.amount : Number(bill.amount);

      if (outside) {
        const settled = await settleBillOutsideKinAction(bill.id);
        if (settled.error) return fail(settled.error);
        return done({ paid: bill.name, amount: Number(bill.amount), due_date: bill.due_date, outside: true });
      }
      // An account the member may move money from: joint, or their own, as
      // record_money allows.
      const { data: accounts } = await supabase.from("accounts").select("id, name, is_joint, owner_member_id").eq("family_id", familyId).eq("is_archived", false);
      const usable = (accounts ?? []).filter((a) => a.is_joint || a.owner_member_id === me.id);
      const accountHits = pickByName(usable, accountName!);
      if (accountHits.length === 0) return fail(`No account called "${accountName}". Available: ${usable.map((a) => a.name).join(", ") || "none yet"}.`);
      if (distinctNames(accountHits).length > 1) return done({ ambiguous_account: distinctNames(accountHits) });
      const paid = await payBillAction({ billId: bill.id, accountId: accountHits[0].id, amount, viaApp: false });
      if (paid.error) return fail(paid.error);
      return done({ paid: bill.name, amount, due_date: bill.due_date, account: accountHits[0].name });
    }

    case "tick_list_item": {
      // One name, or several ("bought the milk and eggs").
      const wantedAll = (Array.isArray(input.names) ? input.names.filter((n): n is string => typeof n === "string" && !!n.trim()) : []).concat(str(input, "name") ? [str(input, "name")!] : []);
      if (wantedAll.length === 0) return fail("Which item?");
      const checked = input.checked !== false;
      const { data: items } = await supabase.from("buy_items").select("id, name, checked").eq("family_id", familyId).eq("cleared", false);
      const flipped: string[] = [];
      const already: string[] = [];
      const missing: string[] = [];
      for (const wanted of wantedAll) {
        const hits = pickByName(items ?? [], wanted);
        if (hits.length === 0) {
          missing.push(wanted);
          continue;
        }
        const names = distinctNames(hits);
        if (names.length > 1) return done({ ambiguous: names });
        const toFlip = hits.filter((i) => i.checked !== checked);
        if (toFlip.length === 0) {
          already.push(names[0]);
          continue;
        }
        for (const item of toFlip) await toggleBuyItemAction(item.id, checked);
        flipped.push(names[0]);
      }
      if (flipped.length === 0 && already.length === 0) return fail(`${missing.map((m) => `"${m}"`).join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} on the list.`);
      if (flipped.length === 0) return done({ already: checked ? "ticked" : "unticked", name: already.join(", ") });
      return done({ [checked ? "ticked" : "unticked"]: flipped.join(", "), count: flipped.length, ...(missing.length > 0 ? { not_on_list: missing } : {}), ...(already.length > 0 ? { already: already.join(", ") } : {}) });
    }

    case "log_chore": {
      const wanted = str(input, "title");
      if (!wanted) return fail("Which chore?");
      const status = input.status === "skipped" ? "skipped" : "done";
      const forName = str(input, "member_name");
      const today = familyDay(new Date(), me.families.time_zone || undefined);
      const day = str(input, "date") ?? today;
      const routines = (await getRoutines(familyId)).filter((r) => !r.paused);
      // The chores falling on the day: today's occurrence, or one of the
      // next few / the overdue ones for another day.
      const onDay = routines.filter((r) => (day === today ? !!r.today : r.upcoming.includes(day) || r.overdue.includes(day)));
      const hits = pickByName(onDay.map((r) => ({ name: r.title, routine: r })), wanted);
      if (hits.length === 0) return fail(`No chore called "${wanted}" ${day === today ? "today" : `on ${day}`}. The Planner's Tasks tab has the list.`);
      const names = distinctNames(hits);
      if (names.length > 1) return done({ ambiguous: names });
      const routine = hits[0].routine;
      // Whose tick it is: the person named, else the asker. A grown-up
      // may tick for a child; the action checks the member is in the
      // household and decides whether an approval is needed.
      let memberId: string | null = null;
      let forWhom: string | null = null;
      if (forName) {
        const member = routine.members.find((m) => m.name.toLowerCase().split(" ")[0] === forName.toLowerCase() || m.name.toLowerCase() === forName.toLowerCase());
        if (member) {
          memberId = member.id;
          forWhom = member.name;
        } else if (!routine.appliesToAll) {
          return fail(`${forName} isn't on "${routine.title}". It is ${routine.members.map((m) => m.name).join(", ")}'s.`);
        } else {
          const { data: anyone } = await supabase.from("members").select("id, full_name").eq("family_id", familyId);
          const m = (anyone ?? []).find((x) => x.full_name.toLowerCase().split(" ")[0] === forName.toLowerCase());
          if (!m) return fail(`Nobody in the household is called ${forName}.`);
          memberId = m.id;
          forWhom = m.full_name;
        }
        if (memberId !== me.id && !isGrownUp(me.role)) return fail("Only a grown-up can tick a chore for somebody else.");
      }
      const logged = await logRoutineAction({ routineId: routine.id, date: day, status, memberId: memberId && memberId !== me.id ? memberId : null });
      if (logged.error) return fail(logged.error);
      return done({ logged: status, title: routine.title, date: day, for: forWhom ?? me.full_name, awaits_approval: !isGrownUp(me.role) });
    }

    default:
      return fail(`Unknown tool "${name}".`);
  }
}
