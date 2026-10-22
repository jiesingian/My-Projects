"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import { ACCOUNT_TYPES, ASSET_ITEM_KINDS, GOAL_CATEGORY, billRemindDays, DEFAULT_BILL_REMIND_DAYS, cleanAccountNumber, TRANSFER_CATEGORY, REMITTANCE_CHANNELS, explainLedgerRefusal, type AccountType, type RemittanceChannel } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { allDayEvent } from "@/lib/calendar-shape";
import { databaseError, reportError, refusalMessage, RLS_EXPLAINED } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { isGrownUp } from "@/lib/roles";
import { pesoRate, type PesoRate } from "@/lib/fx";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { addYears } from "@/lib/sinking-fund";
import { hasNextBill, nextBillDate, nextBillOffer, type NextBillOffer } from "@/lib/bill-roll";

type Db = SupabaseClient<Database>;

function revalidateWealth() {
  revalidatePath("/wealth");
  revalidatePath("/household");
  revalidatePath("/today");
}

/* ---------------------------------------------------------------- accounts */

/** Sets or clears an account's number (account_numbers, its own table so it
 * isn't read with every account row). Row-level security decides who may:
 * the owner of a personal account, any grown-up on a joint one. A refusal
 * comes back as words rather than a silent nothing. */
async function saveAccountNumber(
  supabase: SupabaseClient<Database>,
  familyId: string,
  memberId: string,
  accountId: string,
  number: string | null,
): Promise<string | null> {
  if (number === null) {
    const { error } = await supabase.from("account_numbers").delete().eq("account_id", accountId).eq("family_id", familyId);
    return error ? databaseError(error) : null;
  }
  const { error } = await supabase
    .from("account_numbers")
    .upsert({ account_id: accountId, family_id: familyId, number, updated_by: memberId, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
  if (!error) return null;
  return /row-level security/i.test(error.message)
    ? "Only the account’s owner can set its number — or, on a joint account, a grown-up."
    : databaseError(error);
}

export async function addAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  const subNote = clamp(String(formData.get("sub_note") ?? ""), 200) || null;
  const institution = clamp(String(formData.get("institution") ?? ""), 200) || null;
  const linkedAppUrl = clamp(String(formData.get("linked_app_url") ?? ""), 500) || null;
  const appStoreUrl = clamp(String(formData.get("app_store_url") ?? ""), 500) || null;
  const playStoreUrl = clamp(String(formData.get("play_store_url") ?? ""), 500) || null;
  const accountType = String(formData.get("account_type") ?? "bank");
  const openingBalance = Number(formData.get("opening_balance") ?? 0);
  // Whose it is (Janine, 12 October): "me", "joint", or a managed child's
  // member id -- never another grown-up, whose accounts are theirs to open.
  // Where it is added from no longer decides it.
  const ownerPick = String(formData.get("owner") ?? (formData.get("is_joint") === "on" ? "joint" : "me"));
  const isJoint = ownerPick === "joint";
  let ownerId: string | null = isJoint ? null : me.id;
  if (!isJoint && ownerPick !== "me") {
    if (!isGrownUp(me.role)) return { error: "Only a grown-up can open an account for a child." };
    const { data: child } = await supabase.from("members").select("id, role, family_id").eq("id", ownerPick).maybeSingle();
    if (!child || child.family_id !== me.family_id || child.role !== "child_managed") return { error: "Choose yourself, the family, or a child whose profile you keep." };
    ownerId = child.id;
  }
  // Which Who the Accounts tab was showing when the form was opened, so
  // saving lands back on the same list. A query value, so only ever a
  // plain id-shaped word, never anything that could reshape the URL.
  const returnWho = String(formData.get("return_who") ?? "all");
  const numbered = cleanAccountNumber(String(formData.get("account_number") ?? ""));
  if ("error" in numbered) return { error: numbered.error };
  if (!name) return { error: "Name the account." };
  // The select only ever offers these six, but a form field is a request,
  // not a fact -- nothing stops a replayed or hand-built submission from
  // naming anything else. Same reasoning as setMemberRoleAction's role
  // check: this is the message, not the only lock.
  if (!ACCOUNT_TYPES.includes(accountType as AccountType)) return { error: "That isn't a valid account type." };
  if (!Number.isFinite(openingBalance)) return { error: "Enter a valid opening balance." };

  const { data: created, error } = await supabase.from("accounts").insert({
    family_id: me.family_id,
    name,
    sub_note: subNote,
    institution,
    linked_app_url: linkedAppUrl,
    app_store_url: appStoreUrl,
    play_store_url: playStoreUrl,
    account_type: accountType,
    opening_balance: openingBalance,
    is_joint: isJoint,
    owner_member_id: ownerId,
    // A joint account has no single owner, so "private" on one means
    // private to nobody -- the row's `is_private` column defaults to true
    // at the database level, and leaving it unset here inherited that
    // default even for joint accounts. The account still got created; it
    // just became permanently invisible, to its own creator included,
    // since AccountPrivacyToggle only ever lets a personal account's owner
    // flip this -- a joint account has no owner to do that flipping.
    // Personal accounts keep the old, correct behaviour: private to their
    // owner unless they choose otherwise.
    // A managed child has no login to see a private account with, so theirs
    // is open to the household.
    is_private: isJoint || ownerId !== me.id ? false : true,
    created_by: me.id,
  }).select("id").single();
  if (error) return { error: databaseError(error) };
  // Who can see it, asked on the form for an account of your own.
  if (ownerId === me.id && !isJoint && formData.get("visibility")) {
    const mode = String(formData.get("visibility")) as "everyone" | "only_me" | "chosen";
    const shareError = await shareAccountWith(supabase, me, created.id, { mode, memberIds: formData.getAll("viewer").map(String) });
    if (shareError) {
      revalidateWealth();
      return { error: `The account was saved, but not who can see it (it is kept to you for now): ${shareError}` };
    }
  }
  if (numbered.number) {
    const numberError = await saveAccountNumber(supabase, me.family_id, me.id, created.id, numbered.number);
    // The account exists either way; say so rather than leave the form
    // looking as if nothing was saved.
    if (numberError) {
      revalidateWealth();
      return { error: `The account was saved, but not its number: ${numberError}` };
    }
  }

  revalidateWealth();
  // Saving closes the form and goes back to the list, with the new account
  // opened up and picked out (`new`) so it's plain the save landed.
  const who = /^[\w-]{1,64}$/.test(returnWho) ? returnWho : "all";
  redirect(`/wealth?seg=accounts&who=${who}&new=${created.id}`);
}

export async function updateAccountAction(accountId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  if (!name) return { error: "Name the account." };
  const accountType = String(formData.get("account_type") ?? "bank");
  if (!ACCOUNT_TYPES.includes(accountType as AccountType)) return { error: "That isn't a valid account type." };
  // Only sent by a form that offered the field (to someone who may set it);
  // absent, the number is left as it is.
  const numbered = formData.has("account_number") ? cleanAccountNumber(String(formData.get("account_number"))) : null;
  if (numbered && "error" in numbered) return { error: numbered.error };

  const { error, count } = await supabase
    .from("accounts")
    .update({
      name,
      sub_note: clamp(String(formData.get("sub_note") ?? ""), 200) || null,
      institution: clamp(String(formData.get("institution") ?? ""), 200) || null,
      linked_app_url: clamp(String(formData.get("linked_app_url") ?? ""), 500) || null,
      app_store_url: clamp(String(formData.get("app_store_url") ?? ""), 500) || null,
      play_store_url: clamp(String(formData.get("play_store_url") ?? ""), 500) || null,
      account_type: accountType,
    }, { count: "exact" })
    .eq("id", accountId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That account is no longer there — someone may have removed it." };
  if (numbered) {
    const numberError = await saveAccountNumber(supabase, me.family_id, me.id, accountId, numbered.number);
    if (numberError) return { error: numberError };
  }

  revalidateWealth();
  redirect(`/wealth/accounts/${accountId}`);
}

/** Open a personal account to the household, or close it again. Only its
 * owner can: the update policy on the table says so, so a wrong id from a
 * wrong person changes nothing. A joint account is the household's already
 * and has nothing to open. */
/** Who can see one of your accounts (Janine, 12 October): the whole
 * household, only you, or you and the people you pick. Private-first, so a
 * failure part-way never leaves it more open than either the old or the new
 * choice: it is made private, then its list is replaced, then -- for
 * "everyone" only -- opened. */
export async function setAccountVisibilityAction(accountId: string, choice: { mode: "everyone" | "only_me" | "chosen"; memberIds?: string[] }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: account } = await supabase.from("accounts").select("is_joint, owner_member_id").eq("id", accountId).eq("family_id", me.family_id).maybeSingle();
  if (!account) return { error: "That account is no longer here." };
  if (account.is_joint) return { error: "A joint account belongs to the household already." };
  if (account.owner_member_id !== me.id) return { error: "Only the person whose account it is can change that." };

  const shared = await shareAccountWith(supabase, me, accountId, choice);
  if (shared) return { error: shared };
  revalidateWealth();
  return { error: null };
}

/** Sets is_private and the viewer list for an account the caller owns;
 * returns an error message or null. */
async function shareAccountWith(
  supabase: SupabaseClient<Database>,
  me: { id: string; family_id: string },
  accountId: string,
  choice: { mode: "everyone" | "only_me" | "chosen"; memberIds?: string[] },
): Promise<string | null> {
  if (!["everyone", "only_me", "chosen"].includes(choice.mode)) return "Choose who can see it.";
  const ids = choice.mode === "chosen" ? [...new Set((choice.memberIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id) && id !== me.id))].slice(0, 50) : [];
  if (choice.mode === "chosen" && ids.length === 0) return "Pick at least one person, or choose Only me.";

  const { error: closeError } = await supabase.from("accounts").update({ is_private: true }).eq("id", accountId).eq("family_id", me.family_id);
  if (closeError) return databaseError(closeError);
  const { error: clearError } = await supabase.from("account_viewers").delete().eq("account_id", accountId);
  if (clearError) return databaseError(clearError);
  if (ids.length > 0) {
    const { error } = await supabase
      .from("account_viewers")
      .insert(ids.map((member_id) => ({ account_id: accountId, member_id, family_id: me.family_id, added_by: me.id })));
    if (error) return databaseError(error);
  }
  if (choice.mode === "everyone") {
    const { error } = await supabase.from("accounts").update({ is_private: false }).eq("id", accountId).eq("family_id", me.family_id);
    if (error) return databaseError(error);
  }
  return null;
}

/** The viewer's own choice: count their private accounts in All's totals,
 * or leave them out (they still show under their own name in Who). Their
 * own member row only. */
export async function setIncludePrivateInTotalsAction(include: boolean): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("members").update({ wealth_include_private: include }, { count: "exact" }).eq("id", me.id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That setting couldn't be saved. Try again." };
  revalidateWealth();
  return { error: null };
}

export async function archiveAccountAction(accountId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("accounts").update({ is_archived: true }, { count: "exact" }).eq("id", accountId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That account is no longer there — someone may have removed it." };
  revalidateWealth();
  return { error: null };
}

/** Undoes archiveAccountAction: the account is back in every list and total,
 * with the history it kept the whole time. */
export async function restoreAccountAction(accountId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase.from("accounts").update({ is_archived: false }, { count: "exact" }).eq("id", accountId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That account is no longer there — someone may have removed it." };
  revalidateWealth();
  return { error: null };
}

/** Deletes an account outright -- but only one nothing has ever moved
 * through. An account with movements is refused and pointed at Archive:
 * deleting it would have to take its entries with it, and one leg of a
 * transfer gone means money that left another account and arrived
 * nowhere, in that account's history and every total built from it.
 * Archive keeps all of that whole and only hides the account. Pending
 * entries count, since each is a movement waiting to happen. */
export async function deleteAccountAction(accountId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { count: movements, error: countError } = await supabase
    .from("wealth_transactions")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("family_id", me.family_id);
  if (countError) return { error: databaseError(countError) };
  if ((movements ?? 0) > 0) {
    return { error: `This account has ${movements} movement${movements === 1 ? "" : "s"} in its history, so it can't be deleted without breaking that history. Archive it instead — it disappears from your lists and totals, and its history stays.` };
  }
  const { error, count } = await supabase.from("accounts").delete({ count: "exact" }).eq("id", accountId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That account couldn't be deleted — it may already be gone, or it isn't yours to delete." };
  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------- the ledger */

type LedgerInput = {
  accountId: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  category: string | null;
  occurredAt?: string | null;
  status?: "pending" | "confirmed";
  transferGroupId?: string | null;
  sourceTable?: "bills" | "events" | "buy_items" | "health_appointments" | "goals" | "routines" | "income_schedules" | "assets" | "gift_list_items" | null;
  sourceId?: string | null;
  goalId?: string | null;
};

function ledgerRow(familyId: string, memberId: string, input: LedgerInput): TablesInsert<"wealth_transactions"> {
  return {
    family_id: familyId,
    account_id: input.accountId,
    direction: input.direction,
    amount: input.amount,
    particulars: input.particulars,
    category: input.category,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    status: input.status ?? "confirmed",
    transfer_group_id: input.transferGroupId ?? null,
    source_table: input.sourceTable ?? null,
    source_id: input.sourceId ?? null,
    goal_id: input.goalId ?? null,
    recorded_by: memberId,
  };
}

async function insertEntry(supabase: Db, familyId: string, memberId: string, input: LedgerInput) {
  return supabase.from("wealth_transactions").insert(ledgerRow(familyId, memberId, input)).select().single();
}

/** What a confirmed movement does beyond moving the balance: a bill it paid
 * becomes settled, a goal it funded moves closer. Deferred until confirmation
 * so a payment still waiting in someone's banking app doesn't mark a bill
 * paid prematurely. */
async function applySettlement(supabase: Db, memberId: string, entry: Tables<"wealth_transactions">): Promise<string | null> {
  if (entry.source_table === "bills" && entry.source_id) {
    // The money has already moved. If this fails the bill stays sitting there
    // unpaid, and someone pays it a second time.
    const { error } = await supabase
      .from("bills")
      .update({
        status: "paid",
        paid_at: entry.occurred_at,
        paid_from_account_id: entry.account_id,
        paid_by_member_id: memberId,
        transaction_id: entry.id,
      })
      .eq("id", entry.source_id)
      .eq("family_id", entry.family_id);
    if (error) return `The payment was recorded, but the bill is still showing as unpaid. ${refusalMessage(error)}`;
  }

  if (entry.source_table === "income_schedules" && entry.source_id) {
    // Mirrors the bill branch above: the money has already landed, so a
    // failure here should not be mistaken for the ledger entry itself
    // having failed.
    const { error } = await supabase
      .from("income_schedules")
      .update({ status: "received", received_at: entry.occurred_at, received_by_member_id: memberId, transaction_id: entry.id })
      .eq("id", entry.source_id)
      .eq("family_id", entry.family_id);
    if (error) return `The income was recorded, but the schedule is still showing as expected. ${refusalMessage(error)}`;
  }

  if (entry.goal_id) {
    const goalError = await recalcGoalTotal(supabase, entry.goal_id);
    if (goalError) return `The money moved, but the goal total was not brought up to date. ${refusalMessage(goalError)}`;
  }
  return null;
}

/** The goal's total, recomputed from the ledger rather than added to.
 *
 * Reading the total and writing back read + delta is two round trips with no
 * lock between them, which loses one of two simultaneous contributions and
 * double-counts a Confirm that gets clicked twice. Recomputing is the same
 * number by construction -- a goal starts at 0 and only ever moves by one
 * wealth_transactions row at a time -- but it is a destination rather than a
 * distance, so running it twice is running it once. */
async function recalcGoalTotal(supabase: Db, goalId: string) {
  const { error } = await supabase.rpc("recalc_goal_total", { p_goal_id: goalId });
  return error;
}

/** Money in or out of one account, from a source Kin doesn't otherwise see —
 * salary, business revenue, a gift, a cash purchase. When the member is
 * routing it through their banking app it lands pending, and only counts once
 * they come back and confirm it actually went through. */
export async function recordMovementAction(input: {
  accountId: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  category: string | null;
  occurredAt: string | null;
  viaApp: boolean;
  /** What this money was for, beyond which account it moved through: an
   * asset the household owns, or a goal they are saving into. Optional --
   * most payments are not tied to either. */
  againstTable?: "assets" | "goals" | null;
  againstId?: string | null;
}): Promise<{ error: string | null; transactionId?: string; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!input.particulars.trim()) return { error: "Say what this is for." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  // The id comes from a form, so it is checked against this household rather
  // than trusted -- the same reason the routine log verifies its member.
  let sourceTable: "assets" | "goals" | null = null;
  let sourceId: string | null = null;
  if (input.againstTable && input.againstId) {
    const { data: target } = await supabase
      .from(input.againstTable)
      .select("id")
      .eq("id", input.againstId)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (!target) return { error: "That isn't one of your household's records." };
    sourceTable = input.againstTable;
    sourceId = input.againstId;
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("linked_app_url")
    .eq("id", input.accountId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!account) return { error: "Choose an account." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    ...input,
    particulars: input.particulars.trim(),
    status,
    sourceTable,
    sourceId,
    // A contribution to a goal is also a goal_id, which is what the goal's
    // own progress reads. Setting only source_table would show it in the
    // cashflow breakdown while the goal itself stayed where it was.
    goalId: sourceTable === "goals" ? sourceId : null,
  });
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  return { error: null, transactionId: entry.id, appUrl: input.viaApp ? account.linked_app_url : null };
}

/** Moves money between two of the household's own accounts as a matched pair
 * of entries, so neither side can drift from the other. */
export async function transferAction(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note: string;
  occurredAt: string | null;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (input.fromAccountId === input.toAccountId) return { error: "Pick two different accounts." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, linked_app_url")
    .eq("family_id", me.family_id)
    .in("id", [input.fromAccountId, input.toAccountId]);
  const from = accounts?.find((a) => a.id === input.fromAccountId);
  const to = accounts?.find((a) => a.id === input.toAccountId);
  if (!from || !to) return { error: "Choose both accounts." };

  const status = input.viaApp ? "pending" : "confirmed";
  const transferGroupId = crypto.randomUUID();
  const note = clamp(input.note, 300);

  const legs: LedgerInput[] = [
    {
      accountId: from.id,
      direction: "out",
      amount: input.amount,
      particulars: note || `Transfer to ${to.name}`,
      category: TRANSFER_CATEGORY,
      occurredAt: input.occurredAt,
      status,
      transferGroupId,
    },
    {
      accountId: to.id,
      direction: "in",
      amount: input.amount,
      particulars: note || `Transfer from ${from.name}`,
      category: TRANSFER_CATEGORY,
      occurredAt: input.occurredAt,
      status,
      transferGroupId,
    },
  ];

  // Both legs in ONE statement, and deliberately without asking for the rows
  // back. Each half of that sentence fixes a measured failure.
  //
  // Two separate inserts meant the first could land and the second fail, and
  // the first is the one that takes the money OUT. The household is then down
  // by the amount, it has arrived nowhere, and the person is shown an error --
  // so they do it again, and it goes out twice. One statement makes that
  // impossible rather than unlikely: Postgres commits both rows or neither.
  //
  // The rows are not read back because reading them is what failed. An account
  // is visible when it is joint, mine, OR not private; a transaction on it is
  // visible only when the account is joint or mine. So a member's own account
  // that they have shared with the household appears in the transfer list, and
  // a transaction paid into it cannot be read by anybody else -- the insert is
  // allowed, the RETURNING is refused, and a refused RETURNING takes the whole
  // statement down with it. Nothing here uses the returned rows.
  //
  // Measured 9 September in the throwaway household, transferring into exactly
  // such an account:
  //
  //   two inserts, each asking for its row back   -> 201 then 403, 5,000 gone
  //   one insert, asking for the rows back        -> 403, nothing written
  //   one insert, not asking for them back        -> 201, both legs present
  const { error } = await supabase
    .from("wealth_transactions")
    .insert(legs.map((leg) => ledgerRow(me.family_id, me.id, leg)));
  if (error) return { error: databaseError(error) };

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? from.linked_app_url : null };
}

export async function confirmTransactionAction(transactionId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "Not found." };

  const ids = entry.transfer_group_id
    ? ((await supabase.from("wealth_transactions").select("id").eq("transfer_group_id", entry.transfer_group_id)).data ?? []).map((r) => r.id)
    : [entry.id];

  const { error } = await supabase.from("wealth_transactions").update({ status: "confirmed" }).in("id", ids);
  if (error) return { error: databaseError(error) };

  const settled = await applySettlement(supabase, me.id, { ...entry, status: "confirmed" });
  if (settled) return { error: settled };
  revalidateWealth();
  return { error: null };
}

export async function deleteTransactionAction(transactionId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "Not found." };

  // Which goals this delete will disturb, gathered BEFORE the rows go. A
  // recomputed total is read back off the ledger, so unlike the old
  // subtract-the-amount it has to run once the rows are actually gone --
  // running it first would only rewrite the total it is about to invalidate.
  // A transfer group is deleted whole, so ask the group, not this one row.
  const doomed = supabase.from("wealth_transactions").select("goal_id").eq("family_id", me.family_id).not("goal_id", "is", null);
  const { data: doomedRows } = entry.transfer_group_id
    ? await doomed.eq("transfer_group_id", entry.transfer_group_id)
    : await doomed.eq("id", entry.id);
  const touchedGoalIds = [...new Set((doomedRows ?? []).map((r) => r.goal_id).filter((id): id is string => !!id))];

  // A discarded payment — settled or still pending in someone's banking app —
  // leaves the bill open again, never stranded as "scheduled".
  if (entry.source_table === "bills" && entry.source_id) {
    // The payment is about to be deleted. A bill left marked paid with nothing
    // behind it is a bill nobody will pay.
    const { error: billError } = await supabase
      .from("bills")
      .update({ status: "unpaid", paid_at: null, paid_from_account_id: null, paid_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id)
      .eq("family_id", me.family_id);
    if (billError) return { error: `The bill could not be reopened, so the payment was left in place. ${refusalMessage(billError)}` };
  }

  // Same reopening for income: a discarded receipt goes back to "expected"
  // rather than staying marked received with nothing behind it.
  if (entry.source_table === "income_schedules" && entry.source_id) {
    const { error: incomeError } = await supabase
      .from("income_schedules")
      .update({ status: "expected", received_at: null, received_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id)
      .eq("family_id", me.family_id);
    if (incomeError) return { error: `The income schedule could not be reopened, so the entry was left in place. ${refusalMessage(incomeError)}` };
  }

  const query = supabase.from("wealth_transactions").delete();
  const { error } = entry.transfer_group_id
    ? await query.eq("transfer_group_id", entry.transfer_group_id)
    : await query.eq("id", entry.id);
  if (error) return { error: databaseError(error) };

  for (const goalId of touchedGoalIds) await recalcGoalTotal(supabase, goalId);

  revalidateWealth();
  return { error: null };
}

/** Lets other hubs post real spend against an account — a grocery run cleared
 * in Household, a checkup settled in Family, a trip expense in Planner. */
export async function postHubExpenseAction(input: {
  accountId: string;
  amount: number;
  particulars: string;
  category: string;
  sourceTable: "bills" | "events" | "buy_items" | "health_appointments" | "routines" | "assets" | "gift_list_items";
  sourceId: string | null;
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data: account } = await supabase.from("accounts").select("id").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle();
  if (!account) return { error: "Choose an account this household actually has." };

  // sourceId names a row this hub is about (the bill, the trip, the
  // grocery run...) purely for later reference -- unvalidated, it would let
  // a forged id reach the ledger and, for bills/income_schedules, later
  // flip another family's row via deleteTransactionAction's reopen logic.
  if (input.sourceId) {
    const { data: source } = await supabase.from(input.sourceTable).select("id").eq("id", input.sourceId).eq("family_id", me.family_id).maybeSingle();
    if (!source) return { error: "That isn't something this household has." };
  }

  const { error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: input.particulars,
    category: input.category,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
  });
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------------ bills */

export async function addBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  const amount = Number(formData.get("amount") ?? 0);
  const dueDate = String(formData.get("due_date") ?? "") || null;
  const category = clamp(String(formData.get("category") ?? ""), 100) || null;
  const recurrence = String(formData.get("recurrence") ?? "monthly");
  const remindDaysBefore = billRemindDays(formData.get("remind_days_before"));
  if (!name) return { error: "Name and amount are required." };
  // Every other money path checks `> 0`; this one checked `!amount`, which is
  // false for -500. A negative bill subtracts from what the household owes and
  // reads as money it is owed.
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };

  const { data: bill, error } = await supabase
    .from("bills")
    // The default is the column's own, so a bill left at 3 writes nothing new.
    .insert({ family_id: me.family_id, name, amount, due_date: dueDate, category, recurrence, status: "unpaid", created_by: me.id, ...(remindDaysBefore === DEFAULT_BILL_REMIND_DAYS ? {} : { remind_days_before: remindDaysBefore }) })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  if (dueDate) {
    await syncRowToCalendars(
      me.family_id,
      "bills",
      bill.id,
      allDayEvent(`${name} due`, dueDate),
      { kind: "all" },
    );
  }

  revalidateWealth();
  return { error: null };
}

/** Settling a bill is just a ledger entry that happens to close the bill —
 * the account it came out of drops by exactly what was paid. */
/** The bill was paid with money Kin does not track: cash at the sari-sari
 * store's Bayad Center, a relative's GCash, the office. Marks it paid with
 * no ledger entry and no account, so the balances stay honest and the bill
 * stops shouting on Today (21 October audit: three overdue utilities on the
 * sample household with no way to say "already paid"). */
export async function settleBillOutsideKinAction(billId: string): Promise<ActionState & { next?: NextBillOffer | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .update({ status: "paid", paid_at: familyDay(), paid_by_member_id: me.id, paid_from_account_id: null, transaction_id: null })
    .eq("id", billId)
    .eq("family_id", me.family_id)
    .in("status", ["unpaid", "scheduled"])
    .select("id");
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Bill not found, or already paid." };
  revalidateWealth();
  revalidatePath("/today");
  return { error: null, next: await offerNextBill(supabase, me, billId) };
}

export async function payBillAction(input: {
  billId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null; next?: NextBillOffer | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const [{ data: bill }, { data: account }] = await Promise.all([
    supabase.from("bills").select("*").eq("id", input.billId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!bill) return { error: "Bill not found." };
  if (!account) return { error: "Choose an account to pay from." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `${bill.name} bill`,
    category: bill.category ?? "Utilities",
    status,
    sourceTable: "bills",
    sourceId: bill.id,
  });
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }
  else await supabase.from("bills").update({ status: "scheduled" }).eq("id", bill.id);

  revalidateWealth();
  // Paid in another app it is only scheduled until confirmed; the offer
  // comes on Cash Flow and Today once it is paid.
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null, next: status === "confirmed" ? await offerNextBill(supabase, me, bill.id) : null };
}

/** The same name and repeat, every one the household has: what decides
 * whether the next one already exists. */
async function sameNamedBills(supabase: SupabaseClient<Database>, familyId: string, name: string) {
  const { data } = await supabase.from("bills").select("id, name, amount, due_date, recurrence, status").eq("family_id", familyId).ilike("name", name.trim().replace(/[\\%_]/g, "\\$&"));
  return data ?? [];
}

/** "Add next month's Meralco?" for a bill just paid -- for a grown-up only
 * (Wealth is theirs), and only when the household has no next one yet. */
async function offerNextBill(supabase: SupabaseClient<Database>, me: { family_id: string; role: string }, billId: string): Promise<NextBillOffer | null> {
  if (!isGrownUp(me.role)) return null;
  const { data: bill } = await supabase.from("bills").select("id, name, amount, due_date, recurrence, status").eq("id", billId).eq("family_id", me.family_id).maybeSingle();
  if (!bill) return null;
  return nextBillOffer(bill, await sameNamedBills(supabase, me.family_id, bill.name), familyDay(new Date(), await householdZone()));
}

/** The grown-up said Add (21 October): the next one of a paid repeating
 * bill, at the date and amount they confirmed. Same name, category, repeat
 * and reminder as the paid one. Refused when the next one is already there,
 * so a double tap or a second phone adds one bill, not two. */
export async function addNextBillAction(input: { fromBillId: string; amount: number; dueDate: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can add bills." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) return { error: "Choose the date it is due." };
  const supabase = await createClient();

  const { data: from } = await supabase.from("bills").select("*").eq("id", input.fromBillId).eq("family_id", me.family_id).maybeSingle();
  if (!from || !nextBillDate(from.due_date, from.recurrence, familyDay(new Date(), await householdZone()))) return { error: "Bill not found." };
  if (hasNextBill(from, await sameNamedBills(supabase, me.family_id, from.name))) return { error: "The next one is already there." };

  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      family_id: me.family_id,
      name: from.name,
      amount: input.amount,
      due_date: input.dueDate,
      category: from.category,
      recurrence: from.recurrence,
      remind_days_before: from.remind_days_before,
      status: "unpaid",
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  await syncRowToCalendars(me.family_id, "bills", bill.id, allDayEvent(`${from.name} due`, input.dueDate), { kind: "all" });
  revalidateWealth();
  revalidatePath("/today");
  return { error: null };
}

/** How many days ahead this bill's first reminder comes, changed on the bill
 * itself -- every bill already in the household started at 3. */
export async function setBillReminderAction(billId: string, days: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bills")
    .update({ remind_days_before: billRemindDays(days) })
    .eq("id", billId)
    .eq("family_id", me.family_id)
    .select("id");
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "Bill not found." };
  revalidateWealth();
  revalidatePath("/today");
  return { error: null };
}

export async function deleteBillAction(billId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("bills").delete().eq("id", billId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/* --------------------------------------------------------- income schedules */

/** The income-side mirror of addBillAction — expected money in, rather than
 * expected money out, with the same shape and the same recurrence label
 * that does not itself regenerate anything. */
export async function addIncomeScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  const amount = Number(formData.get("amount") ?? 0);
  const nextDate = String(formData.get("next_date") ?? "") || null;
  const category = clamp(String(formData.get("category") ?? ""), 100) || null;
  const recurrence = String(formData.get("recurrence") ?? "monthly");
  const requestedAccountId = String(formData.get("account_id") ?? "") || null;
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name and amount are required." };
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };

  let accountId: string | null = null;
  if (requestedAccountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", requestedAccountId).eq("family_id", me.family_id).maybeSingle();
    if (!account) return { error: "Choose an account this household actually has." };
    accountId = account.id;
  }

  const { data: schedule, error } = await supabase
    .from("income_schedules")
    .insert({
      family_id: me.family_id,
      name,
      amount,
      next_date: nextDate,
      category,
      recurrence,
      account_id: accountId,
      is_joint: isJoint,
      owner_member_id: isJoint ? null : me.id,
      status: "expected",
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  if (nextDate) {
    await syncRowToCalendars(
      me.family_id,
      "income_schedules",
      schedule.id,
      allDayEvent(`${name} expected`, nextDate),
      { kind: "all" },
    );
  }

  revalidateWealth();
  return { error: null };
}

/** Receiving income is a ledger entry that happens to close the schedule —
 * the mirror of payBillAction, money in rather than out. */
export async function receiveIncomeAction(input: {
  scheduleId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const [{ data: schedule }, { data: account }] = await Promise.all([
    supabase.from("income_schedules").select("*").eq("id", input.scheduleId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!schedule) return { error: "Income schedule not found." };
  if (!account) return { error: "Choose an account to receive it into." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "in",
    amount: input.amount,
    particulars: schedule.name,
    category: schedule.category ?? "Salary",
    status,
    sourceTable: "income_schedules",
    sourceId: schedule.id,
  });
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }
  else await supabase.from("income_schedules").update({ status: "pending" }).eq("id", schedule.id);

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
}

export async function deleteIncomeScheduleAction(scheduleId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("income_schedules").delete().eq("id", scheduleId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/* ---------------------------------------------------------- budget & goals */

export async function setJointBudgetAction(month: number, year: number, amount: number): Promise<ActionState> {
  // The household comes from the session. As an argument it was merely
  // redundant -- RLS scopes budget_periods to the family either way -- but
  // an argument nobody needs is an argument nobody checks.
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("budget_periods").upsert(
    { family_id: me.family_id, period_month: month, period_year: year, budget_amount: amount },
    { onConflict: "family_id,period_month,period_year" },
  );
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/** Your own revenue target, and only ever your own.
 *
 * Both ids used to arrive from the browser. The page guards it -- the control
 * is rendered only when the pane being viewed is your own -- but that guard
 * lives in the one place an attacker does not have to visit, and the row-level
 * policy on wealth_targets checks the family and not the member. So a member
 * could set, and silently overwrite, anybody else's target in the household,
 * while the SELECT policy meant they could not even see what they had done.
 * Confirmed against the throwaway household on 8 September: HTTP 201.
 *
 * The migration alongside this makes the database say so too; taking the ids
 * from the session is the half that does not need anybody to run anything. */
export async function setWealthTargetAction(month: number, year: number, amount: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("wealth_targets").upsert(
    { member_id: me.id, family_id: me.family_id, period_month: month, period_year: year, target_amount: amount },
    { onConflict: "member_id,period_month,period_year" },
  );
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

export async function setAllocationAction(input: { category: string; amount: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const readPeriod = () =>
    supabase.from("budget_periods").select("id").eq("family_id", me.family_id).eq("period_month", month).eq("period_year", year).maybeSingle();

  // A read that failed used to arrive below as "there is no budget for this
  // month yet", and the answer to that is to make one. UNIQUE (family_id,
  // period_month, period_year) refuses the second, so the household got a
  // duplicate-key error rather than a duplicate -- but the allocation read
  // underneath it has no such backstop.
  const { data: existingPeriod, error: periodReadError } = await readPeriod();
  if (periodReadError) return { error: `This month's budget could not be read, so nothing was changed. ${refusalMessage(periodReadError)}` };

  let period = existingPeriod;
  if (!period) {
    const { data: created, error: periodErr } = await supabase
      .from("budget_periods")
      .insert({ family_id: me.family_id, period_month: month, period_year: year, budget_amount: 0 })
      .select("id")
      .single();
    if (periodErr) {
      // Two people setting a budget in the same minute both read "no period
      // yet" and both insert; the constraint lets one through. Theirs is as
      // good as ours -- take it rather than showing a duplicate-key error.
      const { data: raced } = await readPeriod();
      if (!raced) return { error: refusalMessage(periodErr) };
      period = raced;
    } else {
      period = created;
    }
  }
  const periodId = period.id;

  // One statement, no read. This used to look up the category's row and then
  // update it or insert one, which is a race however carefully it is written:
  // two people setting a budget in the same minute both read "no row" and both
  // insert. There was nothing to stop the second -- budget_allocations had no
  // uniqueness on (budget_period_id, category) where every sibling table has
  // one, so the household got the category twice, each copy claiming the whole
  // month's spend. Worse, .maybeSingle() errors on more than one row, so once
  // two existed every save added another.
  //
  // budget_allocations_one_per_category (applied 9 September) is what makes
  // this possible: the upsert names it, so the second writer updates the first
  // writer's row instead of racing it. The read that stood in for the
  // constraint is gone with it -- there is nothing left to read.
  const { error } = await supabase.from("budget_allocations").upsert(
    { budget_period_id: periodId, family_id: me.family_id, category: input.category, amount: input.amount },
    { onConflict: "budget_period_id,category" },
  );
  if (error) return { error: databaseError(error) };

  revalidateWealth();
  return { error: null };
}

export async function createGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const subNote = clamp(String(formData.get("sub_note") ?? ""), 200) || null;
  const isJoint = formData.get("is_joint") === "on";
  const ownerMemberId = isJoint ? null : me.id;
  const targetAmount = formData.get("target_amount") ? Number(formData.get("target_amount")) : null;
  const targetDate = String(formData.get("target_date") ?? "") || null;
  const requestedAccountId = String(formData.get("linked_account_id") ?? "") || null;
  const repeatsYearly = formData.get("repeats_yearly") === "on";
  if (!title) return { error: "Give the goal a title." };
  if (!targetAmount || targetAmount <= 0) return { error: "Set the amount you're saving towards." };
  if (repeatsYearly && !targetDate) return { error: "A yearly cost needs the date it is due." };

  let linkedAccountId: string | null = null;
  if (requestedAccountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", requestedAccountId).eq("family_id", me.family_id).maybeSingle();
    if (!account) return { error: "Choose an account this household actually has." };
    linkedAccountId = account.id;
  }

  const { data: goal, error } = await supabase
    .from("goals")
    .insert({
      family_id: me.family_id,
      title,
      sub_note: subNote,
      is_joint: isJoint,
      owner_member_id: ownerMemberId,
      target_amount: targetAmount,
      target_date: targetDate,
      linked_account_id: linkedAccountId,
      repeats_yearly: repeatsYearly,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  if (targetDate) {
    const target: CalendarTarget = isJoint ? { kind: "all" } : { kind: "member", memberId: ownerMemberId };
    await syncRowToCalendars(me.family_id, "goals", goal.id, allDayEvent(title, targetDate), target);
  }

  revalidateWealth();
  redirect("/wealth?seg=assets");
}

/** Putting money towards a goal moves it out of a real account, so goal
 * progress is always backed by money the household actually set aside. */
export async function contributeToGoalAction(input: {
  goalId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const [{ data: goal }, { data: account }] = await Promise.all([
    supabase.from("goals").select("title").eq("id", input.goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "Goal not found." };
  if (!account) return { error: "Choose an account." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `Towards ${goal.title}`,
    category: GOAL_CATEGORY,
    status,
    goalId: input.goalId,
  });
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
}

/** A sinking fund's cost has come due and been paid. Two movements on the
 * paying account, so its balance ends where it was: the money comes back
 * out of the goal (an "in" carrying goal_id, which recalc_goal_total reads
 * as progress undone), then goes out as the expense it was saved for, in
 * its category, so the month's spending shows it. A yearly fund then moves
 * its date a year on; what was saved beyond the cost stays in the goal as
 * a head start. */
export async function payFromFundAction(input: { goalId: string; accountId: string; amount: number; category: string }): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const [{ data: goal }, { data: account }] = await Promise.all([
    supabase.from("goals").select("title, current_amount, target_date, repeats_yearly, is_joint, owner_member_id").eq("id", input.goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("id").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "Goal not found." };
  if (!account) return { error: "Choose the account it was paid from." };
  if (!(input.amount > 0)) return { error: "Enter what was paid." };
  const category = clamp(input.category, 40) || "Other";
  const fromFund = Math.min(input.amount, Math.max(0, Number(goal.current_amount)));

  if (fromFund > 0) {
    const { data: back, error } = await insertEntry(supabase, me.family_id, me.id, {
      accountId: input.accountId,
      direction: "in",
      amount: fromFund,
      particulars: `From ${goal.title}`,
      category: GOAL_CATEGORY,
      goalId: input.goalId,
    });
    if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };
    const settled = await applySettlement(supabase, me.id, back);
    if (settled) return { error: settled };
  }

  const { error: paidError } = await insertEntry(supabase, me.family_id, me.id, {
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: goal.title,
    category,
  });
  if (paidError) return { error: `The money came out of the goal, but the payment was not recorded. ${explainLedgerRefusal(refusalMessage(paidError, RLS_EXPLAINED))}` };

  if (goal.repeats_yearly && goal.target_date) {
    const next = addYears(goal.target_date, 1);
    const { error } = await supabase.from("goals").update({ target_date: next }).eq("id", input.goalId).eq("family_id", me.family_id);
    if (error) return { error: `Paid, but the next due date was not set. ${databaseError(error)}` };
    const target: CalendarTarget = goal.is_joint ? { kind: "all" } : { kind: "member", memberId: goal.owner_member_id };
    await syncRowToCalendars(me.family_id, "goals", input.goalId, allDayEvent(goal.title, next), target);
  }

  revalidateWealth();
  return { error: null };
}

export async function deleteGoalAction(goalId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/** A money figure off a form, refused rather than stored when it is not one.
 *
 * `Number("")` is 0 and `Number("abc")` is NaN, and neither was checked here.
 * The consequence is not an error message, it is arithmetic: an asset worth
 * -500 subtracts from what the household owns, and a liability of -500 ADDS
 * to its net worth -- which is exactly what somebody types when they read
 * "balance" as "what I owe" and reach for the minus key. Every other money
 * path in this file already required `> 0`; these four did not require
 * anything at all.
 *
 * Zero is allowed, because an asset that has fallen to nothing and a debt
 * that has just been cleared are both real things to record. */
function moneyFromForm(raw: FormDataEntryValue | null): number | null {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ------------------------------------------------------ assets & liabilities */

/** A loan's schedule from a form or the editor: the next payment's date, how
 * many payments are left, and the yearly interest rate in percent. Each is
 * optional; one that is filled in but makes no sense is an error, not a
 * silent blank. */
function readLoanSchedule(raw: { next: unknown; left: unknown; rate: unknown }):
  | { error: string }
  | { next_payment_date: string | null; payments_remaining: number | null; interest_rate: number | null } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const next = text(raw.next);
  const left = text(raw.left);
  const rate = text(raw.rate);
  if (next && !/^\d{4}-\d{2}-\d{2}$/.test(next)) return { error: "The next payment date isn't a date Kin can read." };
  const leftN = left ? Number(left) : null;
  if (leftN !== null && !(Number.isInteger(leftN) && leftN >= 1 && leftN <= 1200)) return { error: "Payments left has to be a whole number from 1 to 1200." };
  const rateN = rate ? Number(rate.replace("%", "")) : null;
  if (rateN !== null && !(Number.isFinite(rateN) && rateN >= 0 && rateN <= 100)) return { error: "The interest rate has to be a percentage from 0 to 100." };
  if (leftN !== null && !next) return { error: "Say when the next payment is due, so Kin knows where the payments left start." };
  return { next_payment_date: next || null, payments_remaining: leftN, interest_rate: rateN };
}

/** A property's yearly change off a form: blank is none (the value stays as
 * typed), otherwise a percentage between -50 and 50 -- minus for a place
 * losing value. */
function yearlyChangeFromForm(raw: FormDataEntryValue | string | null): { pct: number | null } | { error: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { pct: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n < -50 || n > 50) return { error: "The yearly change is a percentage between -50 and 50 (minus if it loses value)." };
  return { pct: n === 0 ? null : n };
}

type AssetItemInput = { name: string; kind: string; cost: string | number; acquired_on?: string | null; value_now?: string | number | null; note?: string | null };

/** One breakdown item, checked and shaped for the table; an error names it. */
function assetItemRow(input: AssetItemInput): { row: { name: string; kind: string; cost: number; acquired_on: string | null; value_now: number | null; note: string | null } } | { error: string } {
  const name = clamp(String(input.name ?? ""), 120);
  if (!name) return { error: "Name each thing in the breakdown." };
  const kind = (ASSET_ITEM_KINDS as readonly string[]).includes(input.kind) ? input.kind : "other";
  const cost = moneyFromForm(String(input.cost ?? ""));
  if (cost === null || String(input.cost ?? "").trim() === "") return { error: `What "${name}" cost has to be a number, and cannot be less than zero.` };
  const valueText = String(input.value_now ?? "").trim();
  const valueNow = valueText ? moneyFromForm(valueText) : null;
  if (valueText && valueNow === null) return { error: `What "${name}" would sell for has to be a number, and cannot be less than zero.` };
  const acquired = String(input.acquired_on ?? "").trim();
  if (acquired && !/^\d{4}-\d{2}-\d{2}$/.test(acquired)) return { error: `When "${name}" was bought has to be a date.` };
  return { row: { name, kind, cost, acquired_on: acquired || null, value_now: valueNow, note: clamp(String(input.note ?? ""), 500) || null } };
}

export async function addAssetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  const value = moneyFromForm(formData.get("value"));
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name the asset." };
  if (value === null) return { error: "What it is worth has to be a number, and cannot be less than zero." };
  const change = yearlyChangeFromForm(formData.get("annual_change_pct"));
  if ("error" in change) return { error: change.error };

  // The breakdown travels as JSON from the form's rows; blank rows are dropped there.
  let rawItems: AssetItemInput[] = [];
  try {
    const parsed = JSON.parse(String(formData.get("items") ?? "[]"));
    rawItems = Array.isArray(parsed) ? parsed.slice(0, 100) : [];
  } catch {
    // The form's own JSON: unreadable means the form is wrong, not the
    // person. Not the parse error itself: it quotes the breakdown.
    reportError("Asset breakdown from the form could not be read", new Error("Asset breakdown was not JSON"));
    return { error: "The breakdown could not be read. Try again." };
  }
  const items = [];
  for (const raw of rawItems) {
    const shaped = assetItemRow(raw);
    if ("error" in shaped) return { error: shaped.error };
    items.push(shaped.row);
  }

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({
      family_id: me.family_id,
      name,
      kind: String(formData.get("kind") ?? "other"),
      value,
      annual_change_pct: change.pct,
      valued_on: familyDay(new Date(), await householdZone()),
      acquired_on: String(formData.get("acquired_on") ?? "") || null,
      note: String(formData.get("note") ?? "").trim() || null,
      is_joint: isJoint,
      owner_member_id: isJoint ? null : me.id,
      created_by: me.id,
    })
    .select("id")
    .single();
  if (error) return { error: databaseError(error) };

  if (items.length > 0) {
    const { error: itemsError } = await supabase
      .from("asset_items")
      .insert(items.map((row) => ({ ...row, asset_id: asset.id, family_id: me.family_id, created_by: me.id })));
    // The asset is saved either way; say so rather than lose it to a retry that doubles it.
    if (itemsError) {
      revalidateWealth();
      return { error: `The asset is saved, but its breakdown was not: ${databaseError(itemsError)} Add the items from Breakdown on the A&L tab.` };
    }
  }

  revalidateWealth();
  redirect("/wealth?seg=assets");
}

export async function addLiabilityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 150);
  const balance = moneyFromForm(formData.get("balance"));
  const monthlyPayment = formData.get("monthly_payment") ? moneyFromForm(formData.get("monthly_payment")) : null;
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name what is owed." };
  // A debt is what is owed, as a positive number. Entered as -500 it does not
  // read as a debt at all -- it adds 500 to the household's net worth.
  if (balance === null) return { error: "What is owed has to be a number, and cannot be less than zero." };
  if (formData.get("monthly_payment") && monthlyPayment === null) {
    return { error: "The monthly payment has to be a number, and cannot be less than zero." };
  }
  const schedule = readLoanSchedule({ next: formData.get("next_payment_date"), left: formData.get("payments_remaining"), rate: formData.get("interest_rate") });
  if ("error" in schedule) return { error: schedule.error };

  const { error } = await supabase.from("liabilities").insert({
    family_id: me.family_id,
    name,
    kind: String(formData.get("kind") ?? "other"),
    balance,
    monthly_payment: monthlyPayment,
    // Only sent when filled in, so adding a liability never depends on them.
    ...Object.fromEntries(Object.entries(schedule).filter(([, v]) => v !== null)),
    lender: String(formData.get("lender") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    is_joint: isJoint,
    owner_member_id: isJoint ? null : me.id,
    created_by: me.id,
  });
  if (error) return { error: databaseError(error) };

  revalidateWealth();
  redirect("/wealth?seg=assets");
}

/** A new value for the asset itself, as of today -- and, when given, its
 * yearly change ("" for none). The change compounds from today on. */
export async function updateAssetValueAction(assetId: string, value: number, annualChangePct?: string): Promise<ActionState> {
  if (!Number.isFinite(value) || value < 0) return { error: "What it is worth has to be a number, and cannot be less than zero." };
  const change = annualChangePct === undefined ? null : yearlyChangeFromForm(annualChangePct);
  if (change && "error" in change) return { error: change.error };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("assets")
    .update(
      {
        value,
        valued_on: familyDay(new Date(), await householdZone()),
        ...(change ? { annual_change_pct: change.pct } : {}),
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", assetId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That asset is no longer there — someone may have removed it." };
  revalidateWealth();
  return { error: null };
}

/** Add one thing to an asset's breakdown: a sofa, the aircon, a year's dues. */
export async function addAssetItemAction(assetId: string, input: AssetItemInput): Promise<ActionState> {
  const shaped = assetItemRow(input);
  if ("error" in shaped) return { error: shaped.error };
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up in the household can change this." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("asset_items")
    .insert({ ...shaped.row, asset_id: assetId, family_id: me.family_id, created_by: me.id });
  if (error) return { error: databaseError(error) };
  await touchAsset(supabase, assetId, me.family_id);
  revalidateWealth();
  return { error: null };
}

export async function updateAssetItemAction(itemId: string, input: AssetItemInput): Promise<ActionState> {
  const shaped = assetItemRow(input);
  if ("error" in shaped) return { error: shaped.error };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset_items")
    .update(shaped.row)
    .eq("id", itemId)
    .eq("family_id", me.family_id)
    .select("asset_id");
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "That item is no longer there — someone may have removed it." };
  await touchAsset(supabase, data[0].asset_id, me.family_id);
  revalidateWealth();
  return { error: null };
}

export async function deleteAssetItemAction(itemId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data, error } = await supabase.from("asset_items").delete().eq("id", itemId).eq("family_id", me.family_id).select("asset_id");
  if (error) return { error: databaseError(error) };
  if (data?.[0]) await touchAsset(supabase, data[0].asset_id, me.family_id);
  revalidateWealth();
  return { error: null };
}

/** The asset's "updated … ago" covers its breakdown too. Not valued_on: the
 * place's own value was not set again. */
async function touchAsset(supabase: SupabaseClient<Database>, assetId: string, familyId: string) {
  await supabase.from("assets").update({ updated_at: new Date().toISOString() }).eq("id", assetId).eq("family_id", familyId);
}

export async function updateLiabilityBalanceAction(liabilityId: string, balance: number): Promise<ActionState> {
  if (!Number.isFinite(balance) || balance < 0) return { error: "What is owed has to be a number, and cannot be less than zero." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("liabilities")
    .update({ balance, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", liabilityId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That liability is no longer there — someone may have removed it." };
  revalidateWealth();
  return { error: null };
}

/** A loan's payment schedule and monthly amount, changed from its row on
 * A&L -- the only way a liability saved before 12 October gets one. */
export async function updateLiabilityScheduleAction(
  liabilityId: string,
  input: { monthlyPayment: string; nextPaymentDate: string; paymentsRemaining: string; interestRate: string },
): Promise<ActionState> {
  const schedule = readLoanSchedule({ next: input.nextPaymentDate, left: input.paymentsRemaining, rate: input.interestRate });
  if ("error" in schedule) return { error: schedule.error };
  const monthly = input.monthlyPayment.trim() ? Number(input.monthlyPayment) : null;
  if (monthly !== null && !(Number.isFinite(monthly) && monthly >= 0)) return { error: "The monthly payment has to be a number, and cannot be less than zero." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("liabilities")
    .update({ ...schedule, monthly_payment: monthly, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", liabilityId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That liability is no longer there — someone may have removed it." };
  revalidateWealth();
  revalidatePath("/planner");
  return { error: null };
}

export async function deleteAssetAction(assetId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("assets").delete().eq("id", assetId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

export async function deleteLiabilityAction(liabilityId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.from("liabilities").delete().eq("id", liabilityId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------- remittances */

/** The reference rate the form shows while it is being filled in. Only a
 * preview: logRemittanceAction looks the rate up again itself rather than
 * storing whatever number a form sends back. */
export async function lookupRemittanceRateAction(currency: string, date: string): Promise<PesoRate | null> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return null;
  return pesoRate(currency, date);
}

export async function logRemittanceAction(input: {
  senderMemberId: string | null;
  senderName: string;
  receiverMemberId: string | null;
  amount: number;
  currency: string;
  sentOn: string;
  phpReceived: number;
  channel: string;
  channelName: string;
  accountId: string | null;
  note: string;
  isPrivate: boolean;
  allocations: { purpose: string; amount: number; category: string | null }[];
}): Promise<ActionState> {
  const me = await requireCurrentMember();
  // The row-level policy is the lock; this is the sentence a child would
  // read instead of a database error, if they ever reached the form.
  if (!isGrownUp(me.role)) return { error: "Remittances are for grown-ups to record." };

  const currency = input.currency.trim().toUpperCase();
  const senderName = clamp(input.senderName, 120);
  if (!input.senderMemberId && !senderName) return { error: "Say who sent it." };
  if (!(input.amount > 0)) return { error: "Enter how much was sent." };
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Choose the currency it was sent in." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.sentOn)) return { error: "Choose the day it was sent." };
  if (!(input.phpReceived > 0)) return { error: "Enter the pesos that actually arrived." };
  if (!REMITTANCE_CHANNELS.includes(input.channel as RemittanceChannel)) return { error: "Choose how it was sent." };

  const allocations = input.allocations
    .map((a) => ({ purpose: clamp(a.purpose, 80), amount: Number(a.amount), category: a.category ? clamp(a.category, 60) : null }))
    .filter((a) => a.purpose || a.amount > 0);
  if (allocations.some((a) => !a.purpose)) return { error: "Name what each part went to." };
  if (allocations.some((a) => !(a.amount > 0))) return { error: "Each part needs an amount." };
  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  if (allocated > input.phpReceived + 0.005) return { error: "What it went to adds up to more than arrived." };

  const rate = await pesoRate(currency, input.sentOn);
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_remittance", {
    p_sender_member_id: input.senderMemberId,
    p_sender_name: input.senderMemberId ? null : senderName,
    p_receiver_member_id: input.receiverMemberId,
    p_amount: input.amount,
    p_currency: currency,
    p_sent_on: input.sentOn,
    p_ecb_rate: rate ? Number(rate.rate.toFixed(8)) : null,
    p_ecb_rate_date: rate?.rateDate ?? null,
    p_rate_source: rate?.source ?? null,
    p_php_received: input.phpReceived,
    p_channel: input.channel,
    p_channel_name: clamp(input.channelName, 120) || null,
    p_account_id: input.accountId,
    p_note: clamp(input.note, 1000) || null,
    p_is_private: input.isPrivate,
    p_allocations: allocations,
  });
  if (error) {
    if (/row-level security/i.test(error.message) && input.accountId) {
      return {
        error: input.isPrivate
          ? "A Just-me remittance can only go into an account of your own. Choose one of yours, or share it with the household."
          : "That account belongs to someone else in the household. Choose a joint account or one of your own.",
      };
    }
    if (/remittance_over_allocated/.test(error.message)) return { error: "What it went to adds up to more than arrived." };
    return { error: databaseError(error) };
  }

  revalidateWealth();
  revalidatePath("/wealth/remittances");
  return { error: null };
}

/** Removes the remittance and the money-in it put on an account, together. */
export async function deleteRemittanceAction(remittanceId: string): Promise<ActionState> {
  await requireCurrentMember();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_remittance", { p_id: remittanceId });
  if (error) return { error: /remittance_not_found/.test(error.message) ? "That remittance is no longer there." : databaseError(error) };
  revalidateWealth();
  revalidatePath("/wealth/remittances");
  return { error: null };
}

/* ------------------------------------------------------ per-person budgets */

/** A grown-up sets someone's spending budget for this month (0 clears it).
 * The household can see it; only a grown-up can change it -- the row-level
 * policy on member_budgets is the lock, this the sentence. */
export async function setMemberBudgetAction(memberId: string, amount: number): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "Only a grown-up can set a budget." };
  if (!Number.isFinite(amount) || amount < 0) return { error: "Enter a budget of zero or more." };
  const supabase = await createClient();
  const now = new Date();
  const period = { period_year: now.getFullYear(), period_month: now.getMonth() + 1 };
  const { error } =
    amount === 0
      ? await supabase.from("member_budgets").delete().eq("family_id", me.family_id).eq("member_id", memberId).match(period)
      : await supabase
          .from("member_budgets")
          .upsert(
            { family_id: me.family_id, member_id: memberId, ...period, amount: Math.round(amount * 100) / 100, set_by: me.id, updated_at: now.toISOString() },
            { onConflict: "member_id,period_year,period_month" },
          );
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}
