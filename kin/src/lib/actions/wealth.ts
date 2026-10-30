"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { celebrateGoalMilestones } from "@/lib/goal-milestones";
import { createClient } from "@/lib/supabase/server";
import { getAccountDetail } from "@/lib/queries/wealth";
import { requireCurrentMember } from "@/lib/session";
import { syncRowToCalendars, type CalendarTarget } from "@/lib/actions/calendar-sync";
import { loanPaymentSplit, loanKindFor, loanStatus, WEEKLY_REMIND_MAX, ACCOUNT_TYPES, ASSET_ITEM_KINDS, GOAL_CATEGORY, billRemindDays, DEFAULT_BILL_REMIND_DAYS, cleanAccountNumber, parseWhose, TRANSFER_CATEGORY, MATCHED_PARTICULARS, REMITTANCE_CHANNELS, explainLedgerRefusal, type AccountType, type RemittanceChannel, isTransferWords } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/database.types";
import { allDayEvent } from "@/lib/calendar-shape";
import { databaseError, reportError, refusalMessage, RLS_EXPLAINED } from "@/lib/report-error";
import { clamp } from "@/lib/text";
import { UUID } from "@/lib/ids";
import { alreadyRecorded, ledgerRowId } from "@/lib/ledger-ids";
import { isGrownUp } from "@/lib/roles";
import { pesoRate, type PesoRate } from "@/lib/fx";
import { householdZone } from "@/lib/household-zone";
import { familyDay } from "@/lib/time";
import { addYears } from "@/lib/sinking-fund";
import { addMonths } from "@/lib/subscriptions";
import { hasNextBill, nextBillDate, nextBillOffer, type NextBillOffer } from "@/lib/bill-roll";

type Db = SupabaseClient<Database>;

function revalidateWealth() {
  revalidatePath("/wealth");
  revalidatePath("/household");
  revalidatePath("/today");
  // Money moved: a 🎯 goal it carried past 25, 50, 75 or 100% says so, once
  // the answer is on its way (lib/goal-milestones).
  after(() => celebrateGoalMilestones().catch(() => {}));
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

/** Sets or removes an account's QR code (account_qr_codes, Janine, 27
 * October): the image the bank or e-wallet gives to receive money, made
 * small on the phone first. Row-level security decides who may, as for the
 * number: the owner of a personal account, any grown-up on a joint one. */
export async function setAccountQrAction(accountId: string, image: string | null): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  if (image === null) {
    const { error } = await supabase.from("account_qr_codes").delete().eq("account_id", accountId).eq("family_id", me.family_id);
    if (error) return { error: databaseError(error) };
  } else {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) return { error: "That file isn't a picture Kin can keep. Try a PNG or JPG." };
    if (image.length > 400_000) return { error: "That picture is too big. Try a screenshot of the QR alone." };
    const { error } = await supabase
      .from("account_qr_codes")
      .upsert({ account_id: accountId, family_id: me.family_id, image, updated_by: me.id, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error)
      return {
        error: /row-level security/i.test(error.message) ? "Only the account’s owner can set its QR code — or, on a joint account, a grown-up." : databaseError(error),
      };
  }
  revalidatePath(`/wealth/accounts/${accountId}`);
  return { error: null };
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
  // A credit card's due day and minimum (20261027140000); cleared for any
  // other type, so a card turned into a bank account stops being reminded.
  let card: { card_due_day: number | null; card_min_payment: number | null } = { card_due_day: null, card_min_payment: null };
  if (accountType === "credit") {
    const dayText = String(formData.get("card_due_day") ?? "").trim();
    const minText = String(formData.get("card_min_payment") ?? "").trim();
    const day = dayText ? Number(dayText) : null;
    if (day !== null && !(Number.isInteger(day) && day >= 1 && day <= 31)) return { error: "The due day is a day of the month, from 1 to 31." };
    const min = minText ? moneyFromForm(minText) : null;
    if (minText && min === null) return { error: "The minimum payment has to be a number, and cannot be less than zero." };
    card = { card_due_day: day, card_min_payment: min };
  }
  // When an investment matures (20261028130000); cleared for other types.
  const maturesText = String(formData.get("matures_on") ?? "").trim();
  if (maturesText && !/^\d{4}-\d{2}-\d{2}$/.test(maturesText)) return { error: "The maturity date isn't a date Kin can read." };
  const matures_on = (accountType === "investment" || accountType === "stocks") && maturesText ? maturesText : null;

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
      ...card,
      matures_on,
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

/** One entry of an account about to be deleted, as Delete Account lists it:
 * whether it is this account's alone or one side of a transfer (and where
 * the other side is), and what else removing it would move -- a goal's
 * progress, a bill or an expected income going back to open. */
export type AccountDeletionEntry = {
  id: string;
  particulars: string;
  occurredAt: string;
  amount: number;
  direction: "in" | "out";
  category: string | null;
  pending: boolean;
  /** Set for one side of a transfer: the account holding the other side,
   * which stays there whatever happens to this one. */
  otherAccountName: string | null;
  transfer: boolean;
  goalTitle: string | null;
  billName: string | null;
  incomeName: string | null;
};

/** What Delete Account shows before anything is removed: every entry on the
 * account, labelled. */
export async function getAccountDeletionPreviewAction(accountId: string): Promise<{ error: string | null; entries?: AccountDeletionEntry[] }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("wealth_transactions")
    .select("id, particulars, occurred_at, amount, direction, category, status, transfer_group_id, goal_id, source_table, source_id")
    .eq("account_id", accountId)
    .eq("family_id", me.family_id)
    .order("occurred_at", { ascending: false });
  if (error) return { error: databaseError(error) };
  const entries = rows ?? [];

  const groups = [...new Set(entries.map((e) => e.transfer_group_id).filter((g): g is string => !!g))];
  const goalIds = [...new Set(entries.map((e) => e.goal_id).filter((g): g is string => !!g))];
  const billIds = entries.filter((e) => e.source_table === "bills" && e.source_id).map((e) => e.source_id as string);
  const incomeIds = entries.filter((e) => e.source_table === "income_schedules" && e.source_id).map((e) => e.source_id as string);
  const [{ data: partners }, { data: goals }, { data: bills }, { data: incomes }] = await Promise.all([
    groups.length
      ? supabase.from("wealth_transactions").select("transfer_group_id, accounts(name)").eq("family_id", me.family_id).in("transfer_group_id", groups).neq("account_id", accountId)
      : Promise.resolve({ data: [] as { transfer_group_id: string | null; accounts: { name: string } | null }[] }),
    goalIds.length ? supabase.from("goals").select("id, title").in("id", goalIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    billIds.length ? supabase.from("bills").select("id, name").in("id", billIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    incomeIds.length ? supabase.from("income_schedules").select("id, name").in("id", incomeIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const partnerName = new Map((partners ?? []).map((p) => [p.transfer_group_id, (p.accounts as { name: string } | null)?.name ?? null]));
  const goalTitle = new Map((goals ?? []).map((g) => [g.id, g.title]));
  const billName = new Map((bills ?? []).map((b) => [b.id, b.name]));
  const incomeName = new Map((incomes ?? []).map((i) => [i.id, i.name]));

  return {
    error: null,
    entries: entries.map((e) => ({
      id: e.id,
      particulars: e.particulars,
      occurredAt: e.occurred_at,
      amount: Number(e.amount),
      direction: e.direction as "in" | "out",
      category: e.category,
      pending: e.status === "pending",
      transfer: !!e.transfer_group_id,
      // The other side may sit in an account this viewer can't see (someone's
      // private one): it is still there, just not named.
      otherAccountName: e.transfer_group_id ? (partnerName.get(e.transfer_group_id) ?? "another account") : null,
      goalTitle: e.goal_id ? (goalTitle.get(e.goal_id) ?? null) : null,
      billName: e.source_table === "bills" && e.source_id ? (billName.get(e.source_id) ?? null) : null,
      incomeName: e.source_table === "income_schedules" && e.source_id ? (incomeName.get(e.source_id) ?? null) : null,
    })),
  };
}

/** Delete Account. The account goes -- out of every list, every total and
 * the Archived list, for good -- usually because it was closed in real life.
 * Its entries stay unless named in `deleteEntryIds`: the money that moved
 * through it really moved, so kept entries still count in the months they
 * happened (marked "(deleted)"). Only this account's own side of a transfer
 * is ever removed; the other side stays on the other account, untouched.
 *
 * Kept entries need the row, so a deleted account is marked (deleted_at,
 * archived too) rather than dropped; one left with no entries at all is
 * removed outright. Marking it comes FIRST: it is the step the database may
 * refuse (not this viewer's to change), and refusing it there destroys
 * nothing. Waiting entries are refused up front -- each is a movement that
 * hasn't happened yet, to confirm or discard before the account goes. */
export async function deleteAccountAction(accountId: string, deleteEntryIds: string[] = []): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entries, error: readError } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("account_id", accountId)
    .eq("family_id", me.family_id);
  if (readError) return { error: databaseError(readError) };
  if ((entries ?? []).some((e) => e.status === "pending")) {
    return { error: "This account has entries waiting on confirmation. Confirm or discard them first, then delete the account." };
  }
  const doomed = (entries ?? []).filter((e) => deleteEntryIds.includes(e.id));
  if (doomed.length !== new Set(deleteEntryIds).size) return { error: "Some of those entries aren't on this account any more. Reload and try again." };
  const emptiesIt = doomed.length === (entries ?? []).length;

  const { error: markError, count } = await supabase
    .from("accounts")
    .update({ is_archived: true, deleted_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", accountId)
    .eq("family_id", me.family_id);
  if (markError) return { error: databaseError(markError) };
  if (count === 0) return { error: "That account couldn't be deleted — it may already be gone, or it isn't yours to delete." };

  // Plans that would otherwise keep pointing at a closed account: a goal or
  // loan tracked against it, a routine's cost, income still expected into it.
  // Settled history (a bill paid from it, income received into it) keeps the
  // link while the row lasts.
  const unlinks = await Promise.all([
    supabase.from("goals").update({ linked_account_id: null }).eq("family_id", me.family_id).eq("linked_account_id", accountId),
    supabase.from("liabilities").update({ linked_account_id: null }).eq("family_id", me.family_id).eq("linked_account_id", accountId),
    supabase.from("routines").update({ cost_account_id: null }).eq("family_id", me.family_id).eq("cost_account_id", accountId),
    supabase.from("income_schedules").update({ account_id: null }).eq("family_id", me.family_id).eq("account_id", accountId).neq("status", "received"),
  ]);
  const unlinkError = unlinks.find((r) => r.error)?.error;
  if (unlinkError) return { error: `The account is deleted, but a plan still points at it. ${refusalMessage(unlinkError)}` };

  if (doomed.length > 0) {
    for (const entry of doomed) {
      const reopenError = await reopenWhatItSettled(supabase, me.family_id, entry);
      if (reopenError) return { error: `The account is deleted and its entries were kept. ${reopenError}` };
    }
    // By id, never by transfer group: the other side of a transfer stays.
    const { error } = await supabase.from("wealth_transactions").delete().in("id", doomed.map((e) => e.id)).eq("family_id", me.family_id);
    if (error) return { error: `The account is deleted and its entries were kept. ${databaseError(error)}` };
    const goalIds = [...new Set(doomed.map((e) => e.goal_id).filter((id): id is string => !!id))];
    for (const goalId of goalIds) await recalcGoalTotal(supabase, goalId);
  }

  if (emptiesIt) {
    // Nothing left to keep: the row itself goes. A failure here leaves it
    // marked deleted -- hidden everywhere, so the person sees it gone anyway.
    await Promise.all([
      supabase.from("bills").update({ paid_from_account_id: null }).eq("family_id", me.family_id).eq("paid_from_account_id", accountId),
      supabase.from("bills").update({ account_id: null }).eq("family_id", me.family_id).eq("account_id", accountId),
      supabase.from("income_schedules").update({ account_id: null }).eq("family_id", me.family_id).eq("account_id", accountId),
    ]);
    await supabase.from("accounts").delete().eq("id", accountId).eq("family_id", me.family_id);
  }

  revalidateWealth();
  return { error: null };
}

/* ------------------------------------------------------------- the ledger */

type LedgerInput = {
  /** The row's id, when the phone made it (Move money): a second send of
   * the same entry then collides with the first instead of adding to it. */
  id?: string;
  accountId: string;
  direction: "in" | "out";
  amount: number;
  particulars: string;
  category: string | null;
  occurredAt?: string | null;
  status?: "pending" | "confirmed";
  transferGroupId?: string | null;
  sourceTable?: "bills" | "events" | "buy_items" | "health_appointments" | "goals" | "routines" | "income_schedules" | "assets" | "gift_list_items" | "liabilities" | null;
  sourceId?: string | null;
  goalId?: string | null;
  /** On a loan payment, the part that pays the loan down; the rest is
   * interest (20261023220000). */
  principal?: number | null;
  /** Buying or adding to an asset, not a living cost (20261023232000). */
  capital?: boolean;
  /** Whose it is; left out, the database takes the account's owner. */
  owner?: { is_joint: boolean; owner_member_id: string | null } | null;
};

function ledgerRow(familyId: string, memberId: string, input: LedgerInput): TablesInsert<"wealth_transactions"> {
  return {
    ...(input.id ? { id: input.id } : {}),
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
    principal_amount: input.sourceTable === "liabilities" ? (input.principal ?? null) : null,
    capital: input.sourceTable === "assets" && !!input.capital,
    recorded_by: memberId,
    ...(input.owner ?? {}),
  };
}

async function insertEntry(supabase: Db, familyId: string, memberId: string, input: LedgerInput) {
  return supabase.from("wealth_transactions").insert(ledgerRow(familyId, memberId, input)).select().single();
}

/** A 🎯 goal's auto-save (bills.auto_save, 20261030180000) is a monthly
 * saving asked for once, so paying one lines up next month's by itself --
 * an ordinary repeating bill is only offered again (lib/bill-roll.ts).
 * Nothing is added while one for the same goal is still open, so a second
 * confirm or a retry lines up one, not two. */
async function rollAutoSaves(supabase: Db, billIds: string[]): Promise<string | null> {
  if (billIds.length === 0) return null;
  const { data: paid } = await supabase.from("bills").select("*").in("id", billIds).eq("auto_save", true);
  for (const b of paid ?? []) {
    if (!b.due_date || !b.against_table || !b.against_id) continue;
    const { data: open } = await supabase
      .from("bills")
      .select("id")
      .eq("family_id", b.family_id)
      .eq("auto_save", true)
      .eq("against_table", b.against_table)
      .eq("against_id", b.against_id)
      .in("status", ["unpaid", "overdue", "scheduled"])
      .limit(1);
    if ((open ?? []).length > 0) continue;
    const { error } = await supabase.from("bills").insert({
      family_id: b.family_id,
      name: b.name,
      amount: b.amount,
      due_date: addMonths(b.due_date.slice(0, 10), 1),
      category: b.category,
      recurrence: b.recurrence,
      status: "unpaid",
      account_id: b.account_id,
      against_table: b.against_table,
      against_id: b.against_id,
      is_joint: b.is_joint,
      owner_member_id: b.owner_member_id,
      remind_days_before: b.remind_days_before,
      auto_save: true,
      created_by: b.created_by,
    });
    if (error) return `It was paid, but next month's auto-save could not be lined up. ${refusalMessage(error)}`;
  }
  return null;
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
    const rolled = await rollAutoSaves(supabase, [entry.source_id]);
    if (rolled) return rolled;
  } else {
    // A bill for a loan, an asset, a goal (20261026150000) or an account
    // (a transfer into it, 20261030180000): its payment's source is what
    // the money was for, and the bill is tied to the payment by
    // transaction_id instead -- for a transfer, to its out leg, whichever
    // leg is confirmed. No such bill: nothing changes.
    const tied = entry.transfer_group_id
      ? ((await supabase.from("wealth_transactions").select("id").eq("transfer_group_id", entry.transfer_group_id)).data ?? []).map((l) => l.id)
      : [entry.id];
    const { data: paid, error } = await supabase
      .from("bills")
      .update({ status: "paid", paid_at: entry.occurred_at, paid_from_account_id: entry.account_id, paid_by_member_id: memberId })
      .in("transaction_id", tied.length ? tied : [entry.id])
      .eq("family_id", entry.family_id)
      .in("status", ["unpaid", "scheduled"])
      .select("id");
    if (error) return `The payment was recorded, but the bill is still showing as unpaid. ${refusalMessage(error)}`;
    const rolled = await rollAutoSaves(supabase, (paid ?? []).map((b) => b.id));
    if (rolled) return rolled;
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
    const next = await lineUpNextInGroup(supabase, memberId, entry.source_id);
    if (next) return next;
  }

  // A loan payment's principal pays the loan down; its interest is the
  // cost. Only once confirmed, like a bill: money still waiting in a banking
  // app has not reached the lender yet.
  if (entry.source_table === "liabilities" && entry.source_id && Number(entry.principal_amount) > 0) {
    const { error } = await supabase.rpc("adjust_liability_balance", { p_liability_id: entry.source_id, p_delta: -Number(entry.principal_amount) });
    if (error) return `The payment was recorded, but the loan's balance was not lowered. ${refusalMessage(error)}`;
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
  againstTable?: "assets" | "goals" | "liabilities" | null;
  againstId?: string | null;
  /** Paying a loan: the part that pays it down (the rest is interest).
   * Left out, Kin works it out from the loan's rate (loanPaymentSplit). */
  principal?: number | null;
  /** Money out for an asset (20261023232000): "buy" -- buying it or a down
   * payment, already in its value; "add" -- adding to it, which becomes
   * one of its items and raises its value; "upkeep" (the default) -- an
   * ordinary expense. */
  assetUse?: "buy" | "add" | "upkeep";
  /** For "add": what kind of item it is (ASSET_ITEM_KINDS). */
  assetItemKind?: string;
  /** "me", "joint" or a member id: whose this money is (parseWhose). */
  whose?: string;
  /** Made on the phone and kept until this saves (Move money, 28 October):
   * the entry's own id, so a retry after an answer lost to a weak signal,
   * or the offline queue sending it later, cannot record it twice. */
  clientId?: string;
}): Promise<{ error: string | null; transactionId?: string; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  if (!input.particulars.trim()) return { error: "Say what this is for." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  // The id comes from a form, so it is checked against this household rather
  // than trusted -- the same reason the routine log verifies its member.
  let sourceTable: "assets" | "goals" | "liabilities" | null = null;
  let sourceId: string | null = null;
  let principal: number | null = null;
  if (input.againstTable === "liabilities" && input.againstId) {
    if (input.direction !== "out") return { error: "A loan is paid with money going out." };
    const { data: loan } = await supabase
      .from("liabilities")
      .select("id, balance, interest_rate")
      .eq("id", input.againstId)
      .eq("family_id", me.family_id)
      .maybeSingle();
    if (!loan) return { error: "That isn't one of your household's loans." };
    const split = loanPaymentSplit(Number(loan.balance), loan.interest_rate == null ? null : Number(loan.interest_rate), input.amount);
    principal = input.principal == null ? split.principal : Math.round(input.principal * 100) / 100;
    if (!(principal >= 0 && principal <= input.amount)) return { error: "The part that pays the loan down has to be between zero and the whole payment." };
    if (principal > Number(loan.balance)) return { error: "That pays down more than is still owed on the loan." };
    sourceTable = "liabilities";
    sourceId = loan.id;
  } else if (input.againstTable && input.againstId) {
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
  const clientId = input.clientId && UUID.test(input.clientId) ? input.clientId : undefined;
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    ...input,
    id: clientId,
    particulars: input.particulars.trim(),
    status,
    sourceTable,
    sourceId,
    principal,
    capital: sourceTable === "assets" && input.direction === "out" && (input.assetUse === "buy" || input.assetUse === "add"),
    // A contribution to a goal is also a goal_id, which is what the goal's
    // own progress reads. Setting only source_table would show it in the
    // cashflow breakdown while the goal itself stayed where it was.
    goalId: sourceTable === "goals" ? sourceId : null,
    owner: input.whose ? parseWhose(input.whose, me.id) : null,
  });
  // Already recorded by an earlier send of this same entry.
  if (error && clientId && error.code === "23505") return { error: null, transactionId: clientId, appUrl: input.viaApp ? account.linked_app_url : null };
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  // Adding to an asset: what it bought becomes one of the asset's items, so
  // the asset is worth more by what it cost. Tied to this payment, it goes
  // if the payment is deleted. Should the item fail, the payment goes too,
  // rather than leaving cash spent on nothing the asset shows.
  if (entry.capital && input.assetUse === "add" && sourceId) {
    const kind = (ASSET_ITEM_KINDS as readonly string[]).includes(input.assetItemKind ?? "") ? input.assetItemKind! : "improvement";
    const { error: itemError } = await supabase.from("asset_items").insert({
      asset_id: sourceId,
      family_id: me.family_id,
      name: clamp(input.particulars.trim(), 150),
      kind,
      cost: input.amount,
      acquired_on: (input.occurredAt ?? new Date().toISOString()).slice(0, 10),
      transaction_id: entry.id,
      created_by: me.id,
    });
    if (itemError) {
      await supabase.from("wealth_transactions").delete().eq("id", entry.id);
      return { error: `Nothing was saved: the item could not be added to the asset. ${refusalMessage(itemError, RLS_EXPLAINED)}` };
    }
  }

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  return { error: null, transactionId: entry.id, appUrl: input.viaApp ? account.linked_app_url : null };
}

/** "Match the bank" (29 October). With no bank sync, an account's balance
 * is only what was logged, and one missed fee or forgotten cash meal leaves
 * it wrong for good. Here a person types what the bank or e-wallet app
 * shows, and Kin records the difference as one confirmed entry today,
 * "Matched to the bank's balance", so the balance is right from now on and
 * the history says when and by how much it was put right. It is filed as a
 * transfer, which every income and spending figure already leaves out: a
 * correction is neither. A credit card's figure is what is owed, so it is
 * entered as a positive amount and kept as the negative balance Kin uses. */
export async function matchBankBalanceAction(input: { accountId: string; bankBalance: number; clientId?: string }): Promise<{ error: string | null; moved?: number }> {
  const me = await requireCurrentMember();
  if (!Number.isFinite(input.bankBalance)) return { error: "Enter the balance the bank shows." };
  const { account } = await getAccountDetail(me.family_id, input.accountId);
  if (!account || account.is_archived) return { error: "That account is no longer there." };
  const target = account.account_type === "credit" ? -Math.abs(input.bankBalance) : input.bankBalance;
  const diff = Math.round((target - account.balance) * 100) / 100;
  if (diff === 0) return { error: null, moved: 0 };

  const supabase = await createClient();
  const clientId = input.clientId && UUID.test(input.clientId) ? input.clientId : undefined;
  const { error } = await insertEntry(supabase, me.family_id, me.id, {
    id: clientId,
    accountId: account.id,
    direction: diff > 0 ? "in" : "out",
    amount: Math.abs(diff),
    particulars: MATCHED_PARTICULARS,
    category: TRANSFER_CATEGORY,
    status: "confirmed",
  });
  if (error && clientId && error.code === "23505") return { error: null, moved: diff };
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };
  revalidateWealth();
  return { error: null, moved: diff };
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
  /** The two legs' ids, made on the phone, as recordMovementAction's
   * clientId: a second send of the same transfer moves nothing. */
  clientIds?: { out: string; in: string };
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
  const ids = input.clientIds && UUID.test(input.clientIds.out) && UUID.test(input.clientIds.in) && input.clientIds.out !== input.clientIds.in ? input.clientIds : undefined;

  const legs: LedgerInput[] = [
    {
      id: ids?.out,
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
      id: ids?.in,
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
  // Already moved by an earlier send of this same transfer: one statement,
  // so both legs are there or neither.
  if (error && ids && error.code === "23505") return { error: null, appUrl: input.viaApp ? from.linked_app_url : null };
  if (error) return { error: databaseError(error) };

  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? from.linked_app_url : null };
}

/** Marks a pending entry as gone through -- both legs of a transfer at
 * once. `edits` is what actually went through when it differs from what
 * was logged ahead of time (Jonathan, 27 October): the reminder is usually
 * the moment the transfer is made, and the amount, the day or the account
 * is then often not quite what was planned. Edits are written while the
 * legs are still pending, one leg at a time, and only then is the group
 * confirmed in one statement: a leg that fails to take its edit leaves
 * the group pending and uncounted, never half-confirmed. */
export async function confirmTransactionAction(
  transactionId: string,
  edits?: { amount: number; occurredOn: string; accountId?: string; fromAccountId?: string; toAccountId?: string },
): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from("wealth_transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!entry) return { error: "Not found." };
  // Confirmed already -- a second tap, a retry, the other phone -- is done,
  // not done again: settling below lowers a loan by its principal each time
  // it runs (review of the watched changes, 29 October).
  if (entry.status === "confirmed") return { error: null };
  if (entry.status !== "pending") return { error: "This entry isn't waiting to be confirmed." };

  const legs = entry.transfer_group_id
    ? ((await supabase.from("wealth_transactions").select("*").eq("transfer_group_id", entry.transfer_group_id)).data ?? [])
    : [entry];
  const ids = legs.map((r) => r.id);

  if (edits) {
    const amount = Math.round(Number(edits.amount) * 100) / 100;
    if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edits.occurredOn)) return { error: "Choose the day it happened." };
    // Keep the time of day it was recorded; only the date moves.
    const occurredAt = `${edits.occurredOn}${entry.occurred_at.slice(10)}`;
    const wanted = [edits.accountId, edits.fromAccountId, edits.toAccountId].filter((id): id is string => !!id);
    const { data: named } = wanted.length ? await supabase.from("accounts").select("id, name").eq("family_id", me.family_id).in("id", wanted) : { data: [] as { id: string; name: string }[] };
    const nameOf = new Map((named ?? []).map((a) => [a.id, a.name]));
    for (const id of wanted) if (!nameOf.has(id)) return { error: "Choose an account you can see." };

    if (entry.transfer_group_id) {
      const out = legs.find((l) => l.direction === "out");
      const into = legs.find((l) => l.direction === "in");
      const fromId = edits.fromAccountId ?? out?.account_id ?? null;
      const toId = edits.toAccountId ?? into?.account_id ?? null;
      if (fromId && toId && fromId === toId) return { error: "Pick two different accounts." };
      for (const leg of legs) {
        const accountId = leg.direction === "out" ? fromId ?? leg.account_id : toId ?? leg.account_id;
        // Kin's own words name the other side; they follow it when it
        // changes. A person's own note is left alone.
        const other = leg.direction === "out" ? toId : fromId;
        const otherName = other ? nameOf.get(other) : undefined;
        const particulars = isTransferWords(leg.particulars) && otherName ? `Transfer ${leg.direction === "out" ? "to" : "from"} ${otherName}` : leg.particulars;
        const { error } = await supabase.from("wealth_transactions").update({ amount, occurred_at: occurredAt, account_id: accountId, particulars }).eq("id", leg.id).eq("family_id", me.family_id);
        if (error) return { error: databaseError(error) };
      }
    } else {
      const accountId = edits.accountId ?? entry.account_id;
      const { error } = await supabase.from("wealth_transactions").update({ amount, occurred_at: occurredAt, account_id: accountId }).eq("id", entry.id).eq("family_id", me.family_id);
      if (error) return { error: databaseError(error) };
      // What settles a bill below reads the entry as it now is.
      Object.assign(entry, { amount, occurred_at: occurredAt, account_id: accountId });
    }
  }

  // Only rows still pending: two confirms at once both read "pending" above,
  // and only the one that moves them settles.
  const { data: moved, error } = await supabase.from("wealth_transactions").update({ status: "confirmed" }).in("id", ids).eq("status", "pending").select("id");
  if (error) return { error: databaseError(error) };
  if (!moved || moved.length === 0) return { error: null };

  const settled = await applySettlement(supabase, me.id, { ...entry, status: "confirmed" });
  if (settled) return { error: settled };
  // A transfer into a goal's To account carries goal_id on its other leg
  // (26 October): confirming either leg moves the goal.
  if (entry.transfer_group_id) {
    const { data: legs } = await supabase.from("wealth_transactions").select("goal_id").eq("transfer_group_id", entry.transfer_group_id).not("goal_id", "is", null);
    for (const goalId of new Set((legs ?? []).map((l) => l.goal_id!).filter((g) => g !== entry.goal_id))) await recalcGoalTotal(supabase, goalId);
  }
  revalidateWealth();
  return { error: null };
}

/** An entry about to be deleted that paid a bill or received an expected
 * income leaves that bill or income open again -- settled or still pending
 * in someone's banking app -- never stranded as paid with nothing behind it.
 * Returns why it couldn't, in words, or null. */
async function reopenWhatItSettled(supabase: Db, familyId: string, entry: Tables<"wealth_transactions">): Promise<string | null> {
  if (entry.source_table === "bills" && entry.source_id) {
    const { error } = await supabase
      .from("bills")
      .update({ status: "unpaid", paid_at: null, paid_from_account_id: null, paid_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id)
      .eq("family_id", familyId);
    if (error) return `The bill could not be reopened, so the payment was left in place. ${refusalMessage(error)}`;
  } else {
    // A bill paid for a loan, an asset or a goal is tied to its payment by
    // transaction_id (20261026150000); one paid as a transfer into an
    // account (20261030180000), to its out leg -- and a transfer is deleted
    // whole, whichever leg is tapped.
    const tied = entry.transfer_group_id
      ? ((await supabase.from("wealth_transactions").select("id").eq("transfer_group_id", entry.transfer_group_id)).data ?? []).map((l) => l.id)
      : [entry.id];
    const { error } = await supabase
      .from("bills")
      .update({ status: "unpaid", paid_at: null, paid_from_account_id: null, paid_by_member_id: null, transaction_id: null })
      .in("transaction_id", tied.length ? tied : [entry.id])
      .eq("family_id", familyId);
    if (error) return `The bill could not be reopened, so the payment was left in place. ${refusalMessage(error)}`;
  }
  if (entry.source_table === "income_schedules" && entry.source_id) {
    const { error } = await supabase
      .from("income_schedules")
      .update({ status: "expected", received_at: null, received_by_member_id: null, transaction_id: null })
      .eq("id", entry.source_id)
      .eq("family_id", familyId);
    if (error) return `The income schedule could not be reopened, so the entry was left in place. ${refusalMessage(error)}`;
  }
  // A confirmed loan payment had lowered the balance; undoing it owes that
  // principal again. A pending one never touched it.
  if (entry.source_table === "liabilities" && entry.source_id && entry.status === "confirmed" && Number(entry.principal_amount) > 0) {
    const { error } = await supabase.rpc("adjust_liability_balance", { p_liability_id: entry.source_id, p_delta: Number(entry.principal_amount) });
    if (error) return `The loan's balance could not be put back, so the payment was left in place. ${refusalMessage(error)}`;
  }
  return null;
}

/** Corrects one ledger entry in place (Janine, 25 October): what it was
 * for, the amount, the day, the category. What the entry is tied to stays
 * in step: a loan payment's split is worked out again on the new amount
 * and the loan moves by the difference in principal; an item it added to
 * an asset takes the new cost; a goal it funded is recounted. A transfer is
 * two entries that must agree, so it is not edited here. */
export async function updateTransactionAction(
  transactionId: string,
  input: {
    particulars: string;
    amount: number;
    occurredOn: string;
    category: string | null;
    accountId?: string;
    /** What it was for, when that changes (Jonathan, 26 October):
     * "liabilities:<id>", "assets:<id>", "goals:<id>" or "" for nothing in
     * particular. Left out: unchanged. Only an entry that is nobody else's
     * -- not a bill's settlement, a hub's posting, or an asset purchase --
     * can be re-tied; the loan or goal it leaves is put back as it was. */
    against?: string;
    /** On a loan: the part that pays it down, when the person changed
     * Kin's split. Null follows the split. */
    principal?: number | null;
  },
): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const particulars = clamp(input.particulars.trim(), 200);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!particulars) return { error: "Say what this is for." };
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.occurredOn)) return { error: "Choose the day it happened." };

  const { data: entry } = await supabase.from("wealth_transactions").select("*").eq("id", transactionId).eq("family_id", me.family_id).maybeSingle();
  if (!entry) return { error: "That entry is no longer there." };
  if (entry.transfer_group_id) return { error: "A transfer is edited by removing it and moving the money again." };

  // Which account it came out of (Jonathan, 26 October). Balances are never
  // stored, only added up from the ledger, so moving the entry is the whole
  // change; a bill it settled follows it. The account has to be one this
  // household has and the member can see -- read as them, a forged or a
  // hidden id is simply not found.
  const accountId = input.accountId && input.accountId !== entry.account_id ? input.accountId : null;
  if (accountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).eq("family_id", me.family_id).is("deleted_at", null).maybeSingle();
    if (!account) return { error: "Choose an account this household actually has." };
  }

  // What it was for. The entry's own tie, as "table:id" ("" for none),
  // and the one asked for; only a free entry's can change.
  const ownTie = entry.source_table === "liabilities" || entry.source_table === "assets" || entry.source_table === "goals" ? `${entry.source_table}:${entry.source_id ?? entry.goal_id ?? ""}` : entry.source_table ? null : "";
  const retie = input.against !== undefined && ownTie !== null && !entry.capital && input.against !== ownTie;
  if (input.against !== undefined && input.against !== (ownTie ?? "") && !retie) return { error: "What this entry was for can't be changed here: it settled a bill, came from another hub, or bought or added to an asset." };
  const against = input.against ?? "";
  const [newTable, newId] = retie && against.includes(":") ? against.split(":", 2) : ["", ""];
  if (retie && newTable && !["liabilities", "assets", "goals"].includes(newTable)) return { error: "That isn't something an entry can be for." };
  if (retie && newTable === "liabilities" && entry.direction !== "out") return { error: "A loan is paid with money going out." };
  // After the change: what the entry is tied to, and the loan to split on.
  const tiedTable = retie ? newTable || null : entry.source_table;
  const tiedId = retie ? newId || null : entry.source_id;
  if (retie && tiedTable && tiedId) {
    const { data: target } = await supabase.from(tiedTable as "liabilities" | "assets" | "goals").select("id").eq("id", tiedId).eq("family_id", me.family_id).maybeSingle();
    if (!target) return { error: "That isn't one of your household's records." };
  }

  // Keep the time of day it was recorded; only the date moves.
  const occurredAt = `${input.occurredOn}${entry.occurred_at.slice(10)}`;
  // The loan's principal: the person's own figure when given; else worked
  // out again when the amount or the loan changed; else as it was.
  const stayingOnLoan = !retie && entry.source_table === "liabilities" && entry.source_id;
  let principal: number | null = tiedTable === "liabilities" ? entry.principal_amount : null;
  if (tiedTable === "liabilities" && tiedId && (input.principal != null || retie || Number(entry.amount) !== amount)) {
    const { data: loan } = await supabase.from("liabilities").select("balance, interest_rate").eq("id", tiedId).maybeSingle();
    if (loan) {
      // What was owed before this payment, if it already lowered the balance.
      const before = Number(loan.balance) + (stayingOnLoan && entry.status === "confirmed" ? Number(entry.principal_amount ?? 0) : 0);
      if (input.principal != null) {
        principal = Math.round(input.principal * 100) / 100;
        if (!(principal >= 0 && principal <= amount)) return { error: "The part that pays the loan down has to be between zero and the whole payment." };
        if (principal > before) return { error: "That pays down more than is still owed on the loan." };
      } else principal = Math.min(loanPaymentSplit(before, loan.interest_rate == null ? null : Number(loan.interest_rate), amount).principal, before);
    } else principal = Math.min(Number(entry.principal_amount ?? 0), amount);
  }

  const { error } = await supabase
    .from("wealth_transactions")
    .update({
      particulars,
      amount,
      occurred_at: occurredAt,
      category: clamp(input.category ?? "", 100) || null,
      principal_amount: principal,
      ...(accountId ? { account_id: accountId } : {}),
      ...(retie ? { source_table: tiedTable, source_id: tiedId, goal_id: tiedTable === "goals" ? tiedId : null } : {}),
    })
    .eq("id", transactionId)
    .eq("family_id", me.family_id);
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };
  // The bill it settled, whichever way it is tied (by source, or by
  // transaction_id when paid for a loan, an asset or a goal).
  if (accountId) await supabase.from("bills").update({ paid_from_account_id: accountId }).eq("transaction_id", transactionId).eq("family_id", me.family_id);

  // The loans: what this payment had paid down comes back on the loan it
  // leaves (or stays on, less what it now pays), and the one it joins or
  // stays on goes down by the new principal. A pending payment never
  // touched either.
  if (entry.status === "confirmed") {
    const oldLoan = entry.source_table === "liabilities" ? entry.source_id : null;
    const newLoan = tiedTable === "liabilities" ? tiedId : null;
    const oldPrincipal = Number(entry.principal_amount ?? 0);
    const newPrincipal = Number(principal ?? 0);
    const moves: { id: string; delta: number }[] = [];
    if (oldLoan && oldLoan === newLoan) {
      if (oldPrincipal !== newPrincipal) moves.push({ id: oldLoan, delta: oldPrincipal - newPrincipal });
    } else {
      if (oldLoan && oldPrincipal > 0) moves.push({ id: oldLoan, delta: oldPrincipal });
      if (newLoan && newPrincipal > 0) moves.push({ id: newLoan, delta: -newPrincipal });
    }
    for (const m of moves) {
      const { error: loanError } = await supabase.rpc("adjust_liability_balance", { p_liability_id: m.id, p_delta: m.delta });
      if (loanError) return { error: `The entry was corrected, but the loan's balance was not. ${refusalMessage(loanError)}` };
    }
  }
  if (entry.capital) await supabase.from("asset_items").update({ cost: amount, name: clamp(particulars, 150) }).eq("transaction_id", transactionId);
  // The goals: the one it left and the one it joined are both recounted.
  const goals = new Set([entry.goal_id, tiedTable === "goals" ? tiedId : null].filter((g): g is string => !!g));
  for (const goalId of goals) await recalcGoalTotal(supabase, goalId);

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

  const reopenError = await reopenWhatItSettled(supabase, me.family_id, entry);
  if (reopenError) return { error: reopenError };

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
  /** Made on the phone and kept until this saves (lib/ledger-ids): a retry
   * after an answer lost to a weak signal cannot record it twice. */
  clientId?: string;
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
    id: ledgerRowId(input.clientId),
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: input.particulars,
    category: input.category,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
  });
  if (alreadyRecorded(error, input.clientId)) return { error: null };
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  revalidateWealth();
  return { error: null };
}

/** An expense already paid (Jonathan, 26 October): the money has left, so
 * it lands in the ledger confirmed, on the day it was paid, out of the
 * account it was paid from -- no Settle, no reminder, no repeat. The same
 * entry Move money records; this is the Add expense
 * sheet's half for it. "For" ties it to a loan (which it pays down), an
 * asset (upkeep, an addition, or buying it) or a goal, as Move money does. */
export async function addPaidExpenseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const particulars = clamp(String(formData.get("name") ?? ""), 200);
  const amount = Number(formData.get("amount") ?? 0);
  const day = String(formData.get("occurred_on") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const category = clamp(String(formData.get("category") ?? ""), 100) || "Other";
  const against = String(formData.get("against") ?? "");
  const assetUse = String(formData.get("asset_use") ?? "upkeep");
  // Paying a loan: the part that pays it down, when the person changed
  // Kin's split (LoanSplitBox); recordMovementAction checks it.
  const principalRaw = String(formData.get("principal") ?? "");
  if (!particulars) return { error: "Say what it's for." };
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Choose the day it was paid." };
  if (!accountId) return { error: "Choose the account it was paid from." };
  const [againstTable, againstId] = against.includes(":") ? against.split(":", 2) : ["", ""];
  if (againstTable && !["assets", "goals", "liabilities"].includes(againstTable)) return { error: "That isn't something an expense can be for." };

  // Paid today: now. An earlier day: midday UTC, which is that same day
  // from UTC-12 to UTC+11, so the entry lands on the day chosen wherever
  // the household is.
  const todayHere = familyDay(new Date(), await householdZone());
  const occurredAt = day === todayHere ? new Date().toISOString() : `${day}T12:00:00.000Z`;
  const res = await recordMovementAction({
    accountId,
    direction: "out",
    amount,
    particulars,
    category,
    occurredAt,
    viaApp: false,
    againstTable: againstTable ? (againstTable as "assets" | "goals" | "liabilities") : null,
    againstId: againstId || null,
    assetUse: againstTable === "assets" && ["buy", "add", "upkeep"].includes(assetUse) ? (assetUse as "buy" | "add" | "upkeep") : undefined,
    principal: againstTable === "liabilities" && principalRaw !== "" ? Number(principalRaw) : null,
    whose: String(formData.get("whose") ?? "me"),
    // The sheet's id for this entry, kept until it saves (lib/ledger-ids).
    clientId: String(formData.get("client_id") ?? "") || undefined,
  });
  return { error: res.error };
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
  // A bill is money due on a day (Jonathan, 26 October): without one it
  // reached neither Today, the calendar, Next 30 days nor a reminder, and
  // sat under Expenses as "Due" with no date. An expense already paid is
  // addPaidExpenseAction's, dated the day it was paid.
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Choose the day it is due." };
  // Which account it comes out of (Jonathan, 26 October), or none to
  // choose when settling. Read as the member: an account they can't see,
  // or another household's, is simply not found.
  const accountId = String(formData.get("account_id") ?? "") || null;
  // What it is for (20261026150000): "liabilities:<id>", "assets:<id>",
  // "goals:<id>" or nothing. Read as the member, as the account is; the
  // database refuses another household's row besides.
  const against = String(formData.get("against") ?? "");
  const [againstTable, againstId] = against.includes(":") ? against.split(":", 2) : ["", ""];
  if (againstTable && !["liabilities", "assets", "goals"].includes(againstTable)) return { error: "That isn't something a bill can be for." };
  // A weekly bill's reminder comes at most WEEKLY_REMIND_MAX days ahead.
  const remindDaysBefore = recurrence === "weekly" ? Math.min(WEEKLY_REMIND_MAX, billRemindDays(formData.get("remind_days_before"))) : billRemindDays(formData.get("remind_days_before"));
  if (!name) return { error: "Say what it's for." };
  // Every other money path checks `> 0`; this one checked `!amount`, which is
  // false for -500. A negative bill subtracts from what the household owes and
  // reads as money it is owed.
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (accountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", accountId).eq("family_id", me.family_id).is("deleted_at", null).maybeSingle();
    if (!account) return { error: "Choose an account this household actually has." };
  }
  if (againstTable && againstId) {
    const { data: target } = await supabase.from(againstTable as "liabilities" | "assets" | "goals").select("id").eq("id", againstId).eq("family_id", me.family_id).maybeSingle();
    if (!target) return { error: "That isn't one of your household's records." };
  }

  const { data: bill, error } = await supabase
    .from("bills")
    // The default is the column's own, so a bill left at 3 writes nothing new.
    .insert({ family_id: me.family_id, name, amount, due_date: dueDate, category, recurrence, status: "unpaid", created_by: me.id, account_id: accountId, against_table: againstTable || null, against_id: againstId || null, ...parseWhose(formData.get("whose"), me.id), ...(remindDaysBefore === DEFAULT_BILL_REMIND_DAYS ? {} : { remind_days_before: remindDaysBefore }) })
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
  const rolled = await rollAutoSaves(supabase, [billId]);
  if (rolled) return { error: rolled };
  revalidateWealth();
  revalidatePath("/today");
  return { error: null, next: await offerNextBill(supabase, me, billId) };
}

export async function payBillAction(input: {
  billId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
  /** A bill for a loan: the part that pays it down, when the person changed
   * Kin's split (LoanSplitBox). Null or left out follows the split. */
  principal?: number | null;
  /** Made on the phone and kept until this saves (lib/ledger-ids): a retry
   * after an answer lost to a weak signal cannot record it twice. */
  clientId?: string;
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
  // Paid already: a stale screen or the other phone would record it, and a
  // loan bill pay the loan down, a second time. This same payment retried
  // (its phone-made id is the bill's transaction) answers as it did.
  if (bill.status === "paid") {
    if (ledgerRowId(input.clientId) && bill.transaction_id === ledgerRowId(input.clientId)) return { error: null };
    return { error: "This bill is already paid." };
  }
  if (bill.against_table === "accounts" && bill.against_id) return payBillAsTransfer(supabase, me, bill, input, account.linked_app_url);

  // A bill for a loan, an asset or a goal (20261026150000): the payment's
  // source is what the money was for, as Move money records it -- a loan
  // payment pays the loan down by its principal once confirmed, upkeep
  // sits on the asset, a contribution counts toward the goal -- and the
  // bill is tied to the payment by transaction_id. A target no longer
  // there (the database lets the bill go of it on delete, but a race is
  // possible) settles as a plain bill.
  const link = await billLink(supabase, me.family_id, bill, input.amount, input.principal ?? null);
  if (link && "error" in link) return { error: link.error };
  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    id: ledgerRowId(input.clientId),
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `${bill.name} bill`,
    category: bill.category ?? (link?.table === "liabilities" ? "Debt" : "Utilities"),
    status,
    sourceTable: link ? link.table : "bills",
    sourceId: link ? link.id : bill.id,
    principal: link?.principal ?? null,
    goalId: link?.table === "goals" ? link.id : null,
    // The payment is whoever the bill is for, whichever account paid it.
    owner: bill.is_joint === null ? null : { is_joint: bill.is_joint, owner_member_id: bill.owner_member_id },
  });
  // Paid already, by an earlier try of this same payment.
  if (alreadyRecorded(error, input.clientId)) return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  // Tied to its payment before settling, so applySettlement finds it by
  // transaction_id; pending, it waits as scheduled until confirmed.
  const { error: tieError } = await supabase
    .from("bills")
    .update({ transaction_id: entry.id, ...(status === "confirmed" ? {} : { status: "scheduled" }) })
    .eq("id", bill.id)
    .eq("family_id", me.family_id);
  if (tieError) return { error: `The payment was recorded, but the bill is still showing as unpaid. ${refusalMessage(tieError)}` };

  if (status === "confirmed") {
    const settled = await applySettlement(supabase, me.id, entry);
    if (settled) return { error: settled };
  }

  revalidateWealth();
  // Paid in another app it is only scheduled until confirmed; the offer
  // comes on Cash Flow and Today once it is paid.
  return { error: null, appUrl: input.viaApp ? account.linked_app_url : null, next: status === "confirmed" ? await offerNextBill(supabase, me, bill.id) : null };
}

/** A bill for one of the household's accounts (a 🎯 savings goal's
 * auto-save, 20261030180000): paying it moves the money there as a
 * transfer -- the same matched pair of entries Move money makes, in one
 * statement -- rather than spending it. The bill is tied to the out leg;
 * paid in a banking app it waits as scheduled until confirmed, and
 * applySettlement then settles it from either leg. */
async function payBillAsTransfer(
  supabase: Db,
  me: { id: string; family_id: string },
  bill: Tables<"bills">,
  input: { accountId: string; amount: number; viaApp: boolean; clientId?: string },
  appUrl: string | null,
): Promise<{ error: string | null; appUrl?: string | null; next?: NextBillOffer | null }> {
  if (input.accountId === bill.against_id) return { error: "Pay it from another account: this is the one it goes into." };
  const { data: accounts } = await supabase.from("accounts").select("id, name").eq("family_id", me.family_id).in("id", [input.accountId, bill.against_id!]);
  const from = accounts?.find((a) => a.id === input.accountId);
  const to = accounts?.find((a) => a.id === bill.against_id);
  if (!to) return { error: "The account it goes into is gone." };
  if (!from) return { error: "Choose an account to pay from." };
  const status = input.viaApp ? "pending" : "confirmed";
  const outId = ledgerRowId(input.clientId) ?? crypto.randomUUID();
  const transferGroupId = crypto.randomUUID();
  const legs: LedgerInput[] = [
    { id: outId, accountId: from.id, direction: "out", amount: input.amount, particulars: `${bill.name} (to ${to.name})`, category: TRANSFER_CATEGORY, status, transferGroupId },
    { id: crypto.randomUUID(), accountId: to.id, direction: "in", amount: input.amount, particulars: `${bill.name} (from ${from.name})`, category: TRANSFER_CATEGORY, status, transferGroupId },
  ];
  // One statement, not read back: see transferAction. Both legs carry an
  // id: rows inserted together share one column list, so a leg without one
  // is sent a null id rather than the default -- and the database refuses
  // the pair (found paying a savings auto-save, 30 October).
  const { error } = await supabase.from("wealth_transactions").insert(legs.map((leg) => ledgerRow(me.family_id, me.id, leg)));
  if (alreadyRecorded(error, input.clientId)) return { error: null, appUrl: input.viaApp ? appUrl : null };
  if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };

  if (status === "confirmed") {
    const { error: paidError } = await supabase
      .from("bills")
      .update({ status: "paid", transaction_id: outId, paid_at: new Date().toISOString(), paid_from_account_id: from.id, paid_by_member_id: me.id })
      .eq("id", bill.id)
      .eq("family_id", me.family_id);
    if (paidError) return { error: `The money moved, but the bill is still showing as unpaid. ${refusalMessage(paidError)}` };
    const rolled = await rollAutoSaves(supabase, [bill.id]);
    if (rolled) return { error: rolled };
  } else {
    const { error: tieError } = await supabase.from("bills").update({ transaction_id: outId, status: "scheduled" }).eq("id", bill.id).eq("family_id", me.family_id);
    if (tieError) return { error: `The transfer was recorded, but the bill is still showing as unpaid. ${refusalMessage(tieError)}` };
  }
  revalidateWealth();
  return { error: null, appUrl: input.viaApp ? appUrl : null, next: null };
}

/** What a bill's payment is for, checked against the household: the loan
 * with its principal (the person's own figure when given, else
 * loanPaymentSplit on what is still owed, capped at it), the asset, or the
 * goal. Null for a plain bill, or one whose target is gone; an error for a
 * principal that cannot be. */
async function billLink(
  supabase: Db,
  familyId: string,
  bill: { against_table: string | null; against_id: string | null },
  amount: number,
  principalOverride: number | null,
): Promise<{ table: "liabilities" | "assets" | "goals"; id: string; principal: number | null } | { error: string } | null> {
  if (!bill.against_table || !bill.against_id) return null;
  if (bill.against_table === "liabilities") {
    const { data: loan } = await supabase.from("liabilities").select("id, balance, interest_rate").eq("id", bill.against_id).eq("family_id", familyId).maybeSingle();
    if (!loan) return null;
    const balance = Number(loan.balance);
    let principal: number;
    if (principalOverride == null) principal = Math.min(loanPaymentSplit(balance, loan.interest_rate == null ? null : Number(loan.interest_rate), amount).principal, balance);
    else {
      principal = Math.round(principalOverride * 100) / 100;
      if (!(principal >= 0 && principal <= amount)) return { error: "The part that pays the loan down has to be between zero and the whole payment." };
      if (principal > balance) return { error: "That pays down more than is still owed on the loan." };
    }
    return { table: "liabilities", id: loan.id, principal };
  }
  if (bill.against_table !== "assets" && bill.against_table !== "goals") return null;
  const { data: target } = await supabase.from(bill.against_table).select("id").eq("id", bill.against_id).eq("family_id", familyId).maybeSingle();
  return target ? { table: bill.against_table, id: target.id, principal: null } : null;
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
      is_joint: from.is_joint,
      owner_member_id: from.owner_member_id,
      // Next month's comes out of the same account, for the same thing.
      account_id: from.account_id,
      against_table: from.against_table,
      against_id: from.against_id,
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
  const whose = parseWhose(formData.get("whose"), me.id);
  if (!name) return { error: "Say what it's for." };
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
      ...whose,
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
  /** Made on the phone and kept until this saves (lib/ledger-ids): a retry
   * after an answer lost to a weak signal cannot record it twice. */
  clientId?: string;
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
  // Received already: the same as a bill already paid, above.
  if (schedule.status === "received") {
    if (ledgerRowId(input.clientId) && schedule.transaction_id === ledgerRowId(input.clientId)) return { error: null };
    return { error: "This income is already received." };
  }

  const status = input.viaApp ? "pending" : "confirmed";
  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    id: ledgerRowId(input.clientId),
    accountId: input.accountId,
    direction: "in",
    amount: input.amount,
    particulars: schedule.name,
    category: schedule.category ?? "Salary",
    status,
    sourceTable: "income_schedules",
    sourceId: schedule.id,
    // Whoever the income is for, whichever account it landed in.
    owner: { is_joint: schedule.is_joint, owner_member_id: schedule.is_joint ? null : schedule.owner_member_id ?? me.id },
  });
  if (alreadyRecorded(error, input.clientId)) return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
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

/* ------------------------------------------------------------ income groups */

const GROUP_FREQUENCIES = { monthly: 1, quarterly: 3, yearly: 12 } as const;
type GroupFrequency = keyof typeof GROUP_FREQUENCIES;
const isGroupFrequency = (f: string): f is GroupFrequency => f in GROUP_FREQUENCIES;

/** Once a regular income's payment is received, its next one is expected:
 * the group's usual amount, one period after the date this one was
 * expected. Nothing is added while one is still open, so a pending payment
 * confirmed twice lines up one, not two. */
async function lineUpNextInGroup(supabase: Db, memberId: string, scheduleId: string): Promise<string | null> {
  const { data: received } = await supabase.from("income_schedules").select("*").eq("id", scheduleId).maybeSingle();
  if (!received?.group_id) return null;
  const [{ data: group }, { data: open }] = await Promise.all([
    supabase.from("income_groups").select("*").eq("id", received.group_id).maybeSingle(),
    supabase.from("income_schedules").select("id").eq("group_id", received.group_id).neq("status", "received").limit(1),
  ]);
  if (!group || (open ?? []).length > 0) return null;
  const from = received.next_date ?? (received.received_at ?? new Date().toISOString()).slice(0, 10);
  const { error } = await supabase.from("income_schedules").insert({
    family_id: received.family_id,
    name: group.name,
    amount: group.usual_amount,
    category: group.category,
    recurrence: group.frequency,
    account_id: group.account_id,
    is_joint: received.is_joint,
    owner_member_id: received.owner_member_id,
    next_date: addMonths(from, isGroupFrequency(group.frequency) ? GROUP_FREQUENCIES[group.frequency] : 1),
    status: "expected",
    created_by: memberId,
    group_id: group.id,
  });
  return error ? `The income was recorded, but its next one could not be lined up. ${refusalMessage(error)}` : null;
}

/** A regular income set up once -- a salary, a business -- and its first
 * payment expected on the date given. Receiving each one lines up the next
 * (lineUpNextInGroup). Grown-ups only (income_groups RLS). */
export async function addIncomeGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const name = clamp(String(formData.get("name") ?? ""), 80);
  const usualAmount = Number(formData.get("usual_amount") ?? 0);
  const category = clamp(String(formData.get("category") ?? ""), 100) || null;
  const frequency = String(formData.get("frequency") ?? "monthly");
  const firstDate = String(formData.get("first_date") ?? "");
  const targetRaw = String(formData.get("monthly_target") ?? "").trim();
  const monthlyTarget = targetRaw ? Number(targetRaw) : null;
  const requestedAccountId = String(formData.get("account_id") ?? "") || null;
  const whose = parseWhose(formData.get("whose"), me.id);
  if (!isGrownUp(me.role)) return { error: "Only a grown-up of the household can set up a regular income." };
  if (!name) return { error: "Give it a name." };
  if (!(usualAmount > 0)) return { error: "Enter a usual amount greater than zero." };
  if (!isGroupFrequency(frequency)) return { error: "Choose how often it comes." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDate)) return { error: "Choose when the next one is expected." };
  if (monthlyTarget !== null && !(monthlyTarget > 0)) return { error: "A monthly target has to be more than zero, or left empty." };

  let accountId: string | null = null;
  if (requestedAccountId) {
    const { data: account } = await supabase.from("accounts").select("id").eq("id", requestedAccountId).eq("family_id", me.family_id).maybeSingle();
    if (!account) return { error: "Choose an account this household actually has." };
    accountId = account.id;
  }

  const { data: group, error } = await supabase
    .from("income_groups")
    .insert({ family_id: me.family_id, name, category, usual_amount: usualAmount, frequency, monthly_target: monthlyTarget, account_id: accountId, recorded_by: me.id })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  const { error: firstError } = await supabase.from("income_schedules").insert({
    family_id: me.family_id,
    name,
    amount: usualAmount,
    category,
    recurrence: frequency,
    account_id: accountId,
    ...whose,
    next_date: firstDate,
    status: "expected",
    created_by: me.id,
    group_id: group.id,
  });
  if (firstError) {
    await supabase.from("income_groups").delete().eq("id", group.id);
    return { error: databaseError(firstError) };
  }

  revalidateWealth();
  return { error: null };
}

/** The group goes, and so does its payment still expected; payments
 * received, or waiting on a banking app's confirmation, stay in INCOME, no
 * longer grouped. */
export async function deleteIncomeGroupAction(groupId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error: openError } = await supabase.from("income_schedules").delete().eq("family_id", me.family_id).eq("group_id", groupId).eq("status", "expected");
  if (openError) return { error: databaseError(openError) };
  const { error } = await supabase.from("income_groups").delete().eq("id", groupId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/* ---------------------------------------------------------- budget & goals */

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

export async function createGoalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const title = clamp(String(formData.get("title") ?? ""), 150);
  const subNote = clamp(String(formData.get("sub_note") ?? ""), 200) || null;
  const isJoint = formData.get("is_joint") === "on";
  // A grown-up may set one up for a child of the household (26 October);
  // anyone else's is their own. goals_child_insert is the lock.
  const requestedOwner = String(formData.get("owner") ?? "");
  let ownerMemberId: string | null = isJoint ? null : me.id;
  let childGoal = false;
  if (!isJoint && /^[0-9a-f-]{36}$/i.test(requestedOwner) && requestedOwner !== me.id) {
    if (!isGrownUp(me.role)) return { error: "Only a grown-up can set up a goal for someone else." };
    const { data: child } = await supabase.from("members").select("id, role").eq("id", requestedOwner).eq("family_id", me.family_id).maybeSingle();
    if (!child || isGrownUp(child.role)) return { error: "A goal can be set up for a child of the household, or for yourself." };
    ownerMemberId = child.id;
    childGoal = true;
  }
  const targetAmount = formData.get("target_amount") ? Number(formData.get("target_amount")) : null;
  const targetDate = String(formData.get("target_date") ?? "") || null;
  const requestedAccountId = String(formData.get("linked_account_id") ?? "") || null;
  // Where Put money in starts, and when saving starts (26 October).
  const requestedFromId = String(formData.get("from_account_id") ?? "") || null;
  // A second source, and what each gives a month (26 October).
  const requestedFrom2Id = (requestedFromId && String(formData.get("from_account_2_id") ?? "")) || null;
  const perMonth = (key: string) => {
    const n = Number(formData.get(key) ?? "");
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  };
  const fromAmount = requestedFromId ? perMonth("from_amount") : null;
  const from2Amount = requestedFrom2Id ? perMonth("from_2_amount") : null;
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(formData.get("start_date") ?? "")) ? String(formData.get("start_date")) : null;
  const repeatsYearly = formData.get("repeats_yearly") === "on";
  if (!title) return { error: "Give the goal a title." };
  if (!targetAmount || targetAmount <= 0) return { error: "Set the amount you're saving towards." };
  if (repeatsYearly && !targetDate) return { error: "A yearly cost needs the date it is due." };
  if (startDate && targetDate && startDate > targetDate) return { error: "The start date comes after the end date." };
  if (requestedFromId && requestedFromId === requestedAccountId) return { error: "Pick two different accounts for From and To, or leave one empty." };
  if (requestedFrom2Id && (requestedFrom2Id === requestedFromId || requestedFrom2Id === requestedAccountId)) return { error: "The second From account must be another account." };

  const requestedIds = [requestedAccountId, requestedFromId, requestedFrom2Id].filter((id): id is string => !!id);
  const { data: named } = requestedIds.length
    ? await supabase.from("accounts").select("id").eq("family_id", me.family_id).in("id", requestedIds)
    : { data: [] as { id: string }[] };
  if (requestedIds.some((id) => !(named ?? []).some((a) => a.id === id))) return { error: "Choose an account this household actually has." };
  const linkedAccountId = requestedAccountId;
  const fromAccountId = requestedFromId;

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
      from_account_id: fromAccountId,
      from_amount: fromAmount,
      from_account_2_id: requestedFrom2Id,
      from_2_amount: from2Amount,
      start_date: startDate,
      repeats_yearly: repeatsYearly,
      created_by: me.id,
    })
    .select()
    .single();
  if (error) return { error: databaseError(error) };

  // The same goal on Planner (Jonathan, 26 October): one entry, two
  // views. A money ring on Planner fills from this savings goal's balance
  // (planner_goals.savings_goal_id, 20260928180000); owned by the same
  // person, or the household for a joint goal, due the same day. The
  // savings goal stands either way; say what did not.
  let plannerError: string | null = null;
  if (formData.get("track_on_planner") === "on") {
    const { error: ringError } = await supabase.from("planner_goals").insert({
      family_id: me.family_id,
      title: clamp(title, 80),
      kind: "money",
      owner_member_id: ownerMemberId,
      target: targetAmount,
      period: "total",
      savings_goal_id: goal.id,
      due_date: targetDate,
      created_by: me.id,
    });
    if (ringError) plannerError = databaseError(ringError);
    else revalidatePath("/planner");
  }

  if (targetDate) {
    // A child's goal: on the child's calendar and the grown-ups'.
    const grownUps = childGoal
      ? ((await supabase.from("members").select("id, role").eq("family_id", me.family_id).eq("status", "active")).data ?? []).filter((m) => isGrownUp(m.role)).map((m) => m.id)
      : [];
    const target: CalendarTarget = isJoint
      ? { kind: "all" }
      : childGoal
        ? { kind: "members", memberIds: [ownerMemberId!, ...grownUps] }
        : { kind: "member", memberId: ownerMemberId };
    await syncRowToCalendars(me.family_id, "goals", goal.id, allDayEvent(title, targetDate), target);
  }

  revalidateWealth();
  if (plannerError) return { error: `The goal is saved, but not its ring on Planner: ${plannerError} Add one there with "Fill from a savings goal".` };
  redirect("/wealth?seg=assets");
}

/** Changing a savings goal (Jonathan, 26 October): there was no way to,
 * short of deleting it with its history. Its name, note, target and date
 * change here, and the ring on Planner that fills from it follows -- the
 * same name, target and date, so the two never disagree. A ring with a
 * reward in play keeps its own target until the giver agrees (the planner
 * trigger holds that line); the reply says so. */
export async function updateSavingsGoalAction(goalId: string, input: { title: string; note: string; target: number; date: string }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const title = clamp(input.title, 150);
  const note = clamp(input.note, 200) || null;
  const date = input.date.trim() || null;
  if (!title) return { error: "Give the goal a title." };
  if (!(input.target > 0)) return { error: "Set the amount you're saving towards." };
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "The date isn't one Kin can read." };
  const { data: goal } = await supabase.from("goals").select("id, repeats_yearly, is_joint, owner_member_id").eq("id", goalId).eq("family_id", me.family_id).maybeSingle();
  if (!goal) return { error: "That goal is no longer there." };
  if (goal.repeats_yearly && !date) return { error: "A yearly cost needs the date it is due." };
  const { error, count } = await supabase
    .from("goals")
    .update({ title, sub_note: note, target_amount: input.target, target_date: date }, { count: "exact" })
    .eq("id", goalId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "Only a grown-up, or whoever the goal is for, can change it." };

  if (date) {
    // As createGoalAction puts it: a child's goal on the child's calendar
    // and the grown-ups'.
    const { data: people } = goal.is_joint ? { data: [] } : await supabase.from("members").select("id, role").eq("family_id", me.family_id).eq("status", "active");
    const owner = (people ?? []).find((m) => m.id === goal.owner_member_id);
    const target: CalendarTarget = goal.is_joint
      ? { kind: "all" }
      : owner && !isGrownUp(owner.role)
        ? { kind: "members", memberIds: [owner.id, ...(people ?? []).filter((m) => isGrownUp(m.role)).map((m) => m.id)] }
        : { kind: "member", memberId: goal.owner_member_id };
    await syncRowToCalendars(me.family_id, "goals", goalId, allDayEvent(title, date), target);
  }

  // The rings that fill from it, one by one: one held by a reward is
  // refused on its own and the rest still follow.
  const { data: rings } = await supabase.from("planner_goals").select("id").eq("family_id", me.family_id).eq("savings_goal_id", goalId).is("removed_at", null);
  let held = 0;
  for (const r of rings ?? []) {
    const { error: ringError } = await supabase.from("planner_goals").update({ title: clamp(title, 80), target: input.target, due_date: date }).eq("id", r.id).eq("family_id", me.family_id);
    if (ringError) held += 1;
  }
  revalidateWealth();
  revalidatePath("/planner");
  if (held > 0) return { error: `Saved. The ring on Planner has a reward promised on it, so its target stays until the one giving the reward agrees: change it there to ask.` };
  return { error: null };
}

/** Putting money towards a goal moves it out of a real account, so goal
 * progress is always backed by money the household actually set aside. */
export async function contributeToGoalAction(input: {
  goalId: string;
  accountId: string;
  amount: number;
  viaApp: boolean;
  /** Made on the phone and kept until this saves (lib/ledger-ids): a retry
   * after an answer lost to a weak signal cannot record it twice. */
  clientId?: string;
}): Promise<{ error: string | null; appUrl?: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  const [{ data: goal }, { data: account }] = await Promise.all([
    supabase.from("goals").select("title, linked_account_id, to:linked_account_id(name)").eq("id", input.goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("name, linked_app_url").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "Goal not found." };
  if (!account) return { error: "Choose an account." };
  // The goal's To account read as the caller (the embed is null when it is
  // someone's "only me" account): a joint goal must not move money into, or
  // out of, a private account its contributor cannot see (29 October).
  if (goal.linked_account_id && !goal.to) return { error: "This goal's account isn't one you can see." };
  if (!(input.amount > 0)) return { error: "Enter an amount greater than zero." };

  const status = input.viaApp ? "pending" : "confirmed";

  // A goal with a To account (Janine, 26 October): the money moves From ->
  // To, both legs in one statement as Move money does, so the To account
  // holds what the goal has saved. The From leg carries goal_id, which is
  // what recalc_goal_total counts; net worth then leaves out of the goal what
  // already sits in an account (getNetWorth), so it is not counted twice.
  // Putting money in from the To account itself is no move at all, and is
  // recorded as before.
  if (goal.linked_account_id && goal.linked_account_id !== input.accountId) {
    const toName = (goal.to as { name: string } | null)?.name ?? "the goal's account";
    const transferGroupId = crypto.randomUUID();
    const { error: moveError } = await supabase.from("wealth_transactions").insert([
      ledgerRow(me.family_id, me.id, {
        id: ledgerRowId(input.clientId),
        accountId: input.accountId,
        direction: "out",
        amount: input.amount,
        particulars: `Towards ${goal.title} · to ${toName}`,
        category: TRANSFER_CATEGORY,
        status,
        transferGroupId,
        goalId: input.goalId,
      }),
      ledgerRow(me.family_id, me.id, {
        id: ledgerRowId(input.clientId, 1),
        accountId: goal.linked_account_id,
        direction: "in",
        amount: input.amount,
        particulars: `Towards ${goal.title} · from ${account.name}`,
        category: TRANSFER_CATEGORY,
        status,
        transferGroupId,
      }),
    ]);
    // Both legs went in one statement, so an earlier try put both there.
    if (alreadyRecorded(moveError, input.clientId)) return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
    if (moveError) return { error: explainLedgerRefusal(refusalMessage(moveError, RLS_EXPLAINED)) };
    if (status === "confirmed") {
      const goalError = await recalcGoalTotal(supabase, input.goalId);
      if (goalError) return { error: `The money moved, but the goal's total did not update. ${refusalMessage(goalError)}` };
    }
    revalidateWealth();
    return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
  }

  const { data: entry, error } = await insertEntry(supabase, me.family_id, me.id, {
    id: ledgerRowId(input.clientId),
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: `Towards ${goal.title}`,
    category: GOAL_CATEGORY,
    status,
    goalId: input.goalId,
  });
  if (alreadyRecorded(error, input.clientId)) return { error: null, appUrl: input.viaApp ? account.linked_app_url : null };
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
const PART_RECORDED = "Part of this was recorded by an earlier try. Check the goal and the account before trying again.";

export async function payFromFundAction(input: { goalId: string; accountId: string; amount: number; category: string; clientId?: string }): Promise<{ error: string | null }> {
  const me = await requireCurrentMember();
  const supabase = await createClient();

  // Up to four rows, written one after another (lib/ledger-ids: legs 0-1
  // the way back from the To account, 2 the way back out of the goal, 3
  // the payment). Found already there from an earlier try: the payment
  // means it is done; anything less means an earlier try stopped part way,
  // and running it again would work out the rest from a goal already moved.
  const legIds = [0, 1, 2, 3].map((leg) => ledgerRowId(input.clientId, leg)).filter((id): id is string => !!id);
  if (legIds.length) {
    const { data: there } = await supabase.from("wealth_transactions").select("id").in("id", legIds).eq("family_id", me.family_id);
    if (there?.some((r) => r.id === legIds[3])) return { error: null };
    if (there?.length) return { error: PART_RECORDED };
  }

  const [{ data: goal }, { data: account }] = await Promise.all([
    supabase.from("goals").select("title, current_amount, target_date, repeats_yearly, is_joint, owner_member_id, linked_account_id").eq("id", input.goalId).eq("family_id", me.family_id).maybeSingle(),
    supabase.from("accounts").select("id").eq("id", input.accountId).eq("family_id", me.family_id).maybeSingle(),
  ]);
  if (!goal) return { error: "Goal not found." };
  if (!account) return { error: "Choose the account it was paid from." };
  // Money held for the goal leaves its To account below; that account must
  // be one the caller can see, as in contributeToGoalAction.
  if (goal.linked_account_id) {
    const { data: held } = await supabase.from("accounts").select("id").eq("id", goal.linked_account_id).eq("family_id", me.family_id).maybeSingle();
    if (!held) return { error: "This goal's account isn't one you can see." };
  }
  if (!(input.amount > 0)) return { error: "Enter what was paid." };
  const category = clamp(input.category, 40) || "Other";
  let fromFund = Math.min(input.amount, Math.max(0, Number(goal.current_amount)));

  // What of it sits in the goal's To account (moved there by transfer, 26
  // October) comes back by transfer too: out of the To account, into the one
  // that paid, the goal's leg on the way in -- so the goal, what it holds in
  // the account, and both balances all end where they should. Paid from the
  // To account itself, the two legs cancel and only the goal moves.
  if (fromFund > 0 && goal.linked_account_id) {
    const { data: legs } = await supabase
      .from("wealth_transactions")
      .select("direction, amount")
      .eq("family_id", me.family_id)
      .eq("goal_id", input.goalId)
      .eq("status", "confirmed")
      .not("transfer_group_id", "is", null);
    const held = Math.max(0, (legs ?? []).reduce((sum, l) => sum + (l.direction === "out" ? 1 : -1) * Number(l.amount), 0));
    const heldPart = Math.min(fromFund, held);
    if (heldPart > 0) {
      const transferGroupId = crypto.randomUUID();
      const { error } = await supabase.from("wealth_transactions").insert([
        ledgerRow(me.family_id, me.id, { id: ledgerRowId(input.clientId, 0), accountId: goal.linked_account_id, direction: "out", amount: heldPart, particulars: `From ${goal.title}`, category: TRANSFER_CATEGORY, transferGroupId }),
        ledgerRow(me.family_id, me.id, { id: ledgerRowId(input.clientId, 1), accountId: input.accountId, direction: "in", amount: heldPart, particulars: `From ${goal.title}`, category: TRANSFER_CATEGORY, transferGroupId, goalId: input.goalId }),
      ]);
      if (alreadyRecorded(error, input.clientId)) return { error: PART_RECORDED };
      if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };
      const goalError = await recalcGoalTotal(supabase, input.goalId);
      if (goalError) return { error: `The money came out of the goal, but its total did not update. ${refusalMessage(goalError)}` };
      fromFund -= heldPart;
    }
  }

  if (fromFund > 0) {
    const { data: back, error } = await insertEntry(supabase, me.family_id, me.id, {
      id: ledgerRowId(input.clientId, 2),
      accountId: input.accountId,
      direction: "in",
      amount: fromFund,
      particulars: `From ${goal.title}`,
      category: GOAL_CATEGORY,
      goalId: input.goalId,
    });
    if (alreadyRecorded(error, input.clientId)) return { error: PART_RECORDED };
    if (error) return { error: explainLedgerRefusal(refusalMessage(error, RLS_EXPLAINED)) };
    const settled = await applySettlement(supabase, me.id, back);
    if (settled) return { error: settled };
  }

  const { error: paidError } = await insertEntry(supabase, me.family_id, me.id, {
    id: ledgerRowId(input.clientId, 3),
    accountId: input.accountId,
    direction: "out",
    amount: input.amount,
    particulars: goal.title,
    category,
  });
  // A second try that got this far at the same time as the first: done.
  if (alreadyRecorded(paidError, input.clientId)) return { error: null };
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
  // The ring on Planner that fills from it goes too (26 October): left
  // behind it would read as a money goal at nothing. Best effort -- the
  // database lets the ring go of the savings goal either way (on delete
  // set null), and a ring with a reward promised on it stays, as its own
  // Delete would leave it.
  await supabase.from("planner_goals").delete().eq("family_id", me.family_id).eq("savings_goal_id", goalId);
  const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  revalidatePath("/planner");
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
function readLoanSchedule(raw: { next: unknown; left: unknown; rate: unknown; original?: unknown; term?: unknown; fixedUntil?: unknown }):
  | { error: string }
  | { next_payment_date: string | null; payments_remaining: number | null; interest_rate: number | null; original_amount: number | null; term_months: number | null; rate_fixed_until: string | null } {
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
  // The loan's own terms (20261026170000), each optional on its own; a term
  // without what was borrowed (or the other way round) says nothing, so
  // both or neither.
  const original = text(raw.original);
  const term = text(raw.term);
  const fixedUntil = text(raw.fixedUntil);
  const originalN = original ? moneyFromForm(original) : null;
  if (original && originalN === null) return { error: "The amount borrowed has to be a number, and cannot be less than zero." };
  const termN = term ? Number(term) : null;
  if (termN !== null && !(Number.isInteger(termN) && termN >= 1 && termN <= 1200)) return { error: "The term has to be a whole number of months from 1 to 1200." };
  if ((originalN !== null) !== (termN !== null)) return { error: "The amount borrowed and the term go together: give both, or neither." };
  if (fixedUntil && !/^\d{4}-\d{2}-\d{2}$/.test(fixedUntil)) return { error: "The day the fixed rate ends isn't a date Kin can read." };
  if (leftN !== null && termN !== null && leftN > termN) return { error: "Payments left cannot be more than the term." };
  return { next_payment_date: next || null, payments_remaining: leftN, interest_rate: rateN, original_amount: originalN, term_months: termN, rate_fixed_until: fixedUntil || null };
}

/** The loan fields off a form, under a prefix ("" for the liability form,
 * "loan_" for the loan on the asset form). */
function loanFromForm(formData: FormData, prefix = "") {
  const get = (k: string) => formData.get(`${prefix}${k}`);
  const monthlyRaw = get("monthly_payment");
  const monthlyPayment = monthlyRaw ? moneyFromForm(monthlyRaw) : null;
  if (monthlyRaw && monthlyPayment === null) return { error: "The monthly payment has to be a number, and cannot be less than zero." };
  const schedule = readLoanSchedule({ next: get("next_payment_date"), left: get("payments_remaining"), rate: get("interest_rate"), original: get("original_amount"), term: get("term_months"), fixedUntil: get("rate_fixed_until") });
  if ("error" in schedule) return schedule;
  return {
    monthly_payment: monthlyPayment,
    // Only sent when filled in, so adding a loan never depends on them.
    ...Object.fromEntries(Object.entries(schedule).filter(([, v]) => v !== null)),
    lender: String(get("lender") ?? "").trim() || null,
  };
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

type AssetItemInput = { name: string; kind: string; cost: string | number; acquired_on?: string | null; value_now?: string | number | null; note?: string | null; warranty_until?: string | null; service_every_months?: string | number | null; last_serviced_on?: string | null };

/** One breakdown item, checked and shaped for the table; an error names it. */
function assetItemRow(input: AssetItemInput): { row: { name: string; kind: string; cost: number; acquired_on: string | null; value_now: number | null; note: string | null; warranty_until: string | null; service_every_months: number | null; last_serviced_on: string | null } } | { error: string } {
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
  // Home upkeep (20261029160000): a warranty's end, how often it is
  // serviced, and when it last was. All optional.
  const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  const warranty = String(input.warranty_until ?? "").trim();
  if (warranty && !isDate(warranty)) return { error: `When the warranty on "${name}" ends has to be a date.` };
  const serviced = String(input.last_serviced_on ?? "").trim();
  if (serviced && !isDate(serviced)) return { error: `When "${name}" was last serviced has to be a date.` };
  const everyText = String(input.service_every_months ?? "").trim();
  const every = everyText ? Number(everyText) : null;
  if (every !== null && !(Number.isInteger(every) && every >= 1 && every <= 60)) return { error: `How often "${name}" is serviced is a number of months, from 1 to 60.` };
  return { row: { name, kind, cost, acquired_on: acquired || null, value_now: valueNow, note: clamp(String(input.note ?? ""), 500) || null, warranty_until: warranty || null, service_every_months: every, last_serviced_on: serviced || null } };
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

  // Bought on a loan (Jonathan, 26 October): one entry, two rows. The asset
  // goes in at its full value and the loan, linked to it (20261023231000),
  // at what is still owed -- how a balance sheet carries a house with a
  // mortgage; A&L shows the difference as what is truly the household's.
  // Checked before anything is saved, so a bad loan field leaves no asset
  // behind.
  const onLoan = formData.get("loan_on") === "on";
  const loanBalance = onLoan ? moneyFromForm(formData.get("loan_balance")) : null;
  if (onLoan && (loanBalance === null || String(formData.get("loan_balance") ?? "").trim() === "")) return { error: "Say how much is still owed on it." };
  const loan = onLoan ? loanFromForm(formData, "loan_") : null;
  if (loan && "error" in loan) return { error: loan.error };
  const kind = String(formData.get("kind") ?? "other");

  const { data: asset, error } = await supabase
    .from("assets")
    .insert({
      family_id: me.family_id,
      name,
      kind,
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

  if (loan && !("error" in loan) && loanBalance !== null) {
    const { error: loanError } = await supabase.from("liabilities").insert({
      family_id: me.family_id,
      name: clamp(String(formData.get("loan_name") ?? "").trim() || `${name} loan`, 150),
      kind: loanKindFor(kind),
      balance: loanBalance,
      ...loan,
      asset_id: asset.id,
      is_joint: isJoint,
      owner_member_id: isJoint ? null : me.id,
      created_by: me.id,
    });
    if (loanError) {
      revalidateWealth();
      return { error: `The asset is saved, but the loan on it was not: ${databaseError(loanError)} Add it with + LIABILITY on the A&L tab and link it to the asset.` };
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
  const isJoint = formData.get("is_joint") === "on";
  if (!name) return { error: "Name what is owed." };
  // A debt is what is owed, as a positive number. Entered as -500 it does not
  // read as a debt at all -- it adds 500 to the household's net worth.
  if (balance === null) return { error: "What is owed has to be a number, and cannot be less than zero." };
  const loan = loanFromForm(formData);
  if ("error" in loan) return { error: loan.error };

  const { error } = await supabase.from("liabilities").insert({
    family_id: me.family_id,
    name,
    kind: String(formData.get("kind") ?? "other"),
    balance,
    ...loan,
    note: String(formData.get("note") ?? "").trim() || null,
    // What it paid for (20261023231000); the database keeps it in-household.
    asset_id: String(formData.get("asset_id") ?? "") || null,
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

/** "Serviced" on a thing in the home (29 October): its last service is
 * today, so the next one counts from here and Today's row goes. */
export async function markItemServicedAction(itemId: string): Promise<ActionState> {
  if (!UUID.test(itemId)) return { error: "That item wasn't found." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const today = familyDay(new Date(), await householdZone());
  const { data, error } = await supabase.from("asset_items").update({ last_serviced_on: today }).eq("id", itemId).eq("family_id", me.family_id).select("id");
  if (error) return { error: databaseError(error) };
  if (!data?.length) return { error: "That item is no longer there — someone may have removed it." };
  revalidateWealth();
  revalidatePath("/today");
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
  input: { monthlyPayment: string; nextPaymentDate: string; paymentsRemaining: string; interestRate: string; originalAmount?: string; termMonths?: string; rateFixedUntil?: string },
): Promise<ActionState> {
  const schedule = readLoanSchedule({ next: input.nextPaymentDate, left: input.paymentsRemaining, rate: input.interestRate, original: input.originalAmount ?? "", term: input.termMonths ?? "", fixedUntil: input.rateFixedUntil ?? "" });
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

/** The schedule is what was off, not the balance (26 October): keep the
 * balance on record and set how many payments are left, from the next one
 * still ahead -- the figure paymentsLeftForBalance read off the
 * amortisation table. */
export async function setLoanPaymentsLeftAction(liabilityId: string, paymentsLeft: number): Promise<ActionState> {
  if (!(Number.isInteger(paymentsLeft) && paymentsLeft >= 1 && paymentsLeft <= 1200)) return { error: "Payments left has to be a whole number from 1 to 1200." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: loan } = await supabase.from("liabilities").select("next_payment_date, payments_remaining").eq("id", liabilityId).eq("family_id", me.family_id).maybeSingle();
  if (!loan) return { error: "That liability is no longer there — someone may have removed it." };
  const today = familyDay(new Date(), await householdZone());
  // The next date still ahead, else the one entered, else this day next
  // month: the count has to start somewhere on the calendar.
  const next = loanStatus(loan, today).next ?? loan.next_payment_date ?? addMonths(today, 1);
  const { error } = await supabase
    .from("liabilities")
    .update({ next_payment_date: next, payments_remaining: paymentsLeft, updated_at: new Date().toISOString() })
    .eq("id", liabilityId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  revalidatePath("/planner");
  return { error: null };
}

/** A loan's new rate after its fixed rate ends (Jonathan, 28 October):
 * the rate, the monthly payment (the one Kin worked out, or the bank's),
 * and optionally the next fixed-until day. The balance and payments left
 * today are kept as where the bank's new table starts (20261028120000), so
 * the balance check runs from here rather than the original terms. */
export async function repriceLoanAction(liabilityId: string, input: { rate: number; payment: number; fixedUntil: string }): Promise<ActionState> {
  if (!(Number.isFinite(input.rate) && input.rate >= 0 && input.rate <= 100)) return { error: "The interest rate has to be a percentage from 0 to 100." };
  if (!(Number.isFinite(input.payment) && input.payment > 0)) return { error: "The monthly payment has to be more than zero." };
  const fixedUntil = input.fixedUntil.trim();
  if (fixedUntil && !/^\d{4}-\d{2}-\d{2}$/.test(fixedUntil)) return { error: "The day the new fixed rate ends isn't a date Kin can read." };
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: loan } = await supabase.from("liabilities").select("balance, next_payment_date, payments_remaining").eq("id", liabilityId).eq("family_id", me.family_id).maybeSingle();
  if (!loan) return { error: "That loan is no longer there — someone may have removed it." };
  const today = familyDay(new Date(), await householdZone());
  const left = loanStatus(loan, today).left;
  if (!(left > 0)) return { error: "Set when the next payment is due and how many are left first, under Payments." };
  const { error, count } = await supabase
    .from("liabilities")
    .update(
      {
        interest_rate: input.rate,
        monthly_payment: Math.round(input.payment * 100) / 100,
        rate_fixed_until: fixedUntil || null,
        repriced_on: today,
        repriced_balance: Number(loan.balance),
        repriced_payments_left: left,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", liabilityId)
    .eq("family_id", me.family_id);
  if (error) return { error: databaseError(error) };
  if (count === 0) return { error: "That loan is no longer there — someone may have removed it." };
  revalidateWealth();
  revalidatePath("/today");
  revalidatePath("/planner");
  return { error: null };
}

/** A loan's payment as a monthly bill (Jonathan, 26 October): the loan row
 * on A&L makes the bill once, for the next payment, against the loan
 * (20261026150000), so it reaches Today, the calendar and the reminder
 * without retyping, and Settle pays the loan down. The loan's own
 * schedule stays as it is; "Add the next one?" after each payment carries
 * the bill forward, as any monthly bill. */
export async function addLoanBillAction(liabilityId: string): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { data: loan } = await supabase
    .from("liabilities")
    .select("id, name, monthly_payment, next_payment_date, payments_remaining, linked_account_id, is_joint, owner_member_id")
    .eq("id", liabilityId)
    .eq("family_id", me.family_id)
    .maybeSingle();
  if (!loan) return { error: "That loan is no longer there — someone may have removed it." };
  const amount = loan.monthly_payment == null ? 0 : Number(loan.monthly_payment);
  if (!(amount > 0)) return { error: "Set the loan's monthly payment first, under Payments." };
  const today = familyDay(new Date(), await householdZone());
  const due = loanStatus(loan, today).next ?? loan.next_payment_date;
  if (!due) return { error: "Set when the next payment is due first, under Payments." };
  const { data: open } = await supabase
    .from("bills")
    .select("id")
    .eq("family_id", me.family_id)
    .eq("against_table", "liabilities")
    .eq("against_id", loan.id)
    .in("status", ["unpaid", "scheduled"])
    .limit(1);
  if (open && open.length > 0) return { error: "This loan already has a bill waiting under Cash Flow → Expenses." };
  const name = clamp(`${loan.name} payment`, 150);
  const { data: bill, error } = await supabase
    .from("bills")
    .insert({
      family_id: me.family_id,
      name,
      amount,
      due_date: due,
      category: "Debt",
      recurrence: "monthly",
      status: "unpaid",
      created_by: me.id,
      account_id: loan.linked_account_id,
      against_table: "liabilities",
      against_id: loan.id,
      is_joint: loan.is_joint,
      owner_member_id: loan.owner_member_id,
    })
    .select("id")
    .single();
  if (error) return { error: databaseError(error) };
  await syncRowToCalendars(me.family_id, "bills", bill.id, allDayEvent(`${name} due`, due), { kind: "all" });
  revalidateWealth();
  revalidatePath("/today");
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

/** Links a loan to the asset it paid for, or unlinks it (null) -- so A&L
 * can show the asset's equity: its value less what is still owed on it. */
export async function setLiabilityAssetAction(liabilityId: string, assetId: string | null): Promise<ActionState> {
  const me = await requireCurrentMember();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("liabilities")
    .update({ asset_id: assetId }, { count: "exact" })
    .eq("id", liabilityId)
    .eq("family_id", me.family_id);
  if (error) return { error: error.message.includes("liability_asset_not_in_family") ? "That asset isn't this household's." : databaseError(error) };
  if (count === 0) return { error: "That liability is no longer there — someone may have removed it." };
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
  /** Made on the phone and kept until this saves (20261029030000): the
   * remittance's own id, so a retry after a lost answer logs it once. */
  clientId?: string;
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
  if (!(input.phpReceived > 0)) return { error: "Enter the amount that actually arrived." };
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
  const args = {
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
  };
  const clientId = input.clientId && UUID.test(input.clientId) ? input.clientId : undefined;
  let { error } = await supabase.rpc("log_remittance", clientId ? { ...args, p_client_id: clientId } : args);
  // The app can be live a few minutes before 20261029030000 reaches the
  // database, which then has no p_client_id (PGRST202): sent as before.
  if (error?.code === "PGRST202" && clientId) ({ error } = await supabase.rpc("log_remittance", args));
  // Two tries at once: the second meets the first at the primary key.
  if (error && clientId && error.code === "23505") return { error: null };
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

/* ------------------------------------------------- budgets by category */

/** Sets one category's budget for Family or one person, from this month on
 * (26 October); it repeats into later months until changed. 0 removes it
 * from this month on; past months keep what they were. Who may: any
 * grown-up for Family and for a child; a grown-up for themselves alone; a
 * child with their own login for themselves. spending_budgets' policies are
 * the lock, this the sentence. `whose` is a member id or "family". */
export async function setSpendingBudgetAction(input: { whose: string; category: string; amount: number }): Promise<ActionState> {
  const me = await requireCurrentMember();
  const category = clamp(String(input.category ?? "").trim(), 100);
  if (!category) return { error: "Choose a category." };
  if (!Number.isFinite(input.amount) || input.amount < 0) return { error: "Enter a budget of zero or more." };
  const supabase = await createClient();
  const memberId = input.whose === "family" ? null : input.whose;
  if (memberId === null) {
    if (!isGrownUp(me.role)) return { error: "Only a grown-up can set Family's budget." };
  } else if (memberId !== me.id) {
    const { data: them } = await supabase.from("members").select("role").eq("id", memberId).eq("family_id", me.family_id).maybeSingle();
    if (!them) return { error: "That person is no longer in the household." };
    if (isGrownUp(them.role)) return { error: "A grown-up's budget is theirs alone to set." };
    if (!isGrownUp(me.role)) return { error: "Only a grown-up can set someone else's budget." };
  } else if (me.role === "child_managed") {
    return { error: "A grown-up sets this budget." };
  }
  const now = new Date();
  const fromMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { error } = await supabase.from("spending_budgets").upsert(
    { family_id: me.family_id, member_id: memberId, category, amount: Math.round(input.amount * 100) / 100, from_month: fromMonth, set_by: me.id, updated_at: now.toISOString() },
    { onConflict: "family_id,member_id,category,from_month" },
  );
  if (error) return { error: databaseError(error) };
  revalidateWealth();
  return { error: null };
}

/** A grown-up's own choice of who sees their budgets: every grown-up (as a
 * new account), only them, or people they pick -- the same choices an
 * account has. */
export async function setBudgetVisibilityAction(choice: { mode: "everyone" | "only_me" | "chosen"; memberIds?: string[] }): Promise<ActionState> {
  const me = await requireCurrentMember();
  if (!isGrownUp(me.role)) return { error: "A child's budget is seen by the grown-ups and the child." };
  if (!["everyone", "only_me", "chosen"].includes(choice.mode)) return { error: "Choose who can see it." };
  const ids = choice.mode === "chosen" ? [...new Set((choice.memberIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id) && id !== me.id))].slice(0, 50) : [];
  if (choice.mode === "chosen" && ids.length === 0) return { error: "Pick at least one person, or choose Only me." };
  const supabase = await createClient();
  // Closed first, then the list, then opened if asked: a failure half-way
  // leaves it hidden, never shown to more people than chosen.
  const { error: closeError } = await supabase
    .from("budget_sharing")
    .upsert({ member_id: me.id, family_id: me.family_id, is_private: true, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (closeError) return { error: databaseError(closeError) };
  const { error: clearError } = await supabase.from("budget_viewers").delete().eq("family_id", me.family_id).eq("owner_member_id", me.id);
  if (clearError) return { error: databaseError(clearError) };
  if (ids.length > 0) {
    const { error } = await supabase.from("budget_viewers").insert(ids.map((viewer_member_id) => ({ owner_member_id: me.id, viewer_member_id, family_id: me.family_id })));
    if (error) return { error: databaseError(error) };
  }
  if (choice.mode === "everyone") {
    const { error } = await supabase.from("budget_sharing").update({ is_private: false }).eq("member_id", me.id);
    if (error) return { error: databaseError(error) };
  }
  revalidateWealth();
  return { error: null };
}
