"use client";

import { WhoseSelect } from "@/components/whose-select";
import { RemittanceFields, UtangFields, type OpenLent } from "@/components/income-category-extras";
import { FormSheet } from "@/components/form-sheet";
import { AccountOptions } from "@/components/account-options";
import { sortByUse, type PickableAccount } from "@/lib/account-picker";
import { confirm } from "@/components/confirm-sheet";
import { useCurrencySymbol } from "@/components/household-currency";
import { cloneElement, isValidElement, useActionState, useId, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccountAction,
  setWealthTargetAction,
  setSpendingBudgetAction,
  setBudgetVisibilityAction,
  addBillAction,
  addPaidExpenseAction,
  addIncomeScheduleAction,
  addIncomeGroupAction,
  setBillReminderAction,
} from "@/lib/actions/wealth";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  categoryLabel,
  UTANG_CATEGORY,
  type WhoseOption,
  INCOME_FREQUENCY_LABELS,
  BILL_REMIND_DAYS,
  WEEKLY_REMIND_MAX,
  DEFAULT_BILL_REMIND_DAYS,
  knownAppsForType,
  isKnownInstitutionLabel,
  resolveInstitutionLinks,
  type AccountType,
  type AccountAudienceMember,
} from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";
import { AmountInput } from "@/components/amount-input";
import { formatCurrency } from "@/lib/format";
import { AccountNumberField } from "@/components/account-number";
import { AudienceChoices, type AudienceMode } from "@/components/money-actions";

const initialState: ActionState = { error: null };

/** Rough and deliberately so -- this only decides which explanation or
 * which store link to act on, never whether a field or button works, so a
 * wrong guess costs nothing. */
export function phoneKind(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "other";
}

const noSubscription = () => () => {};

/** phoneKind(), read safely during render. The server can't see a
 * visitor's user agent, so the server (and first client paint) always get
 * "other" from getServerSnapshot below; useSyncExternalStore -- not an
 * effect, which would fight React's own lint rule against setState in one
 * -- swaps in the real answer right after hydration, with no mismatch
 * between what the server sent and what the browser first painted. */
export function usePhoneKind(): "ios" | "android" | "other" {
  return useSyncExternalStore(noSubscription, phoneKind, () => "other" as const);
}

/** One field instead of two: which bank or wallet this is, AND (for the
 * three Kin knows) the links that go with it, filled in the same motion.
 * Keeping "BANK / WALLET" as free text next to a separate row of the same
 * three names as tap-to-fill chips asked for the same fact twice -- typing
 * "BPI" and then also tapping the BPI chip. One dropdown does both: pick a
 * known name and its links arrive with it, or pick Other and type whatever
 * this account's institution actually is, exactly as before.
 *
 * For GCash, BPI or BDO there is nothing left to show: LINK APP resolves
 * to the one right link for whoever's filling this in (GCash's own
 * gcash://, or for BPI/BDO -- which have no scheme of their own -- the
 * matching store page, App Store or Play Store, since that opens fine on
 * any device). The APP STORE LINK / PLAY STORE LINK boxes disappear
 * entirely; both values are still saved underneath so the account page's
 * OPEN button gets the right one for whoever views it later, on
 * whichever phone that is, not just whoever filled in the form.
 *
 * For anything else, Kin has no memorized link to reach for, so LINK APP
 * stays a plain field someone fills in themselves -- on a computer, since
 * a phone-app link (or a store page) mostly doesn't exist there, the hint
 * points at the account's website instead. The two store fields only
 * appear once BANK / WALLET is explicitly set to Other -- not on a blank,
 * not-yet-answered form, and not for a known name, so nothing shows here
 * only to vanish the moment an answer arrives. When they do show, they're
 * collapsed to whichever matches the current phone, with a button to
 * reveal the other for a household that mixes iPhone and Android -- the
 * one place a device can't be detected away, because no web page, Kin
 * included, can read a phone's installed apps or a store link nobody has
 * told it yet.
 *
 * None of this applies to a cash account -- there is no institution or app
 * for physical cash to link to -- so the whole section is skipped for that
 * one account type, and the label itself widens from "BANK / WALLET" to
 * "INSTITUTION / APP" for the other types it doesn't quite fit (a credit
 * card's issuer, an investment platform, "other"). */
export function AppLinksField({
  accountType,
  defaultInstitution,
  defaultAppUrl,
  defaultAppStoreUrl,
  defaultPlayStoreUrl,
}: {
  accountType: AccountType;
  defaultInstitution?: string;
  defaultAppUrl?: string;
  defaultAppStoreUrl?: string;
  defaultPlayStoreUrl?: string;
}) {
  const startsCustom = !!defaultInstitution && !isKnownInstitutionLabel(defaultInstitution);

  const [selected, setSelected] = useState(startsCustom ? "other" : (defaultInstitution ?? ""));
  const [customInstitution, setCustomInstitution] = useState(startsCustom ? (defaultInstitution ?? "") : "");
  const [appUrl, setAppUrl] = useState(defaultAppUrl ?? "");
  const [appStoreUrl, setAppStoreUrl] = useState(defaultAppStoreUrl ?? "");
  const [playStoreUrl, setPlayStoreUrl] = useState(defaultPlayStoreUrl ?? "");
  const [tested, setTested] = useState(false);
  const [showOtherStore, setShowOtherStore] = useState(false);
  const institutionId = useId();
  const appId = useId();
  const storeId = useId();
  const playId = useId();
  const kind = usePhoneKind();
  const availableApps = knownAppsForType(accountType);

  // TYPE changing can strand a pick that no longer applies -- BPI selected
  // under Bank, then TYPE flipped to E-wallet. Adjusted here, during render
  // (React's own documented way to react to a prop change without an
  // effect: https://react.dev/learn/you-might-not-need-an-effect), rather
  // than in a useEffect, which this repo's lint already refuses for
  // exactly this shape of setState.
  const [priorAccountType, setPriorAccountType] = useState(accountType);
  if (accountType !== priorAccountType) {
    setPriorAccountType(accountType);
    const stillOffered = selected === "" || selected === "other" || availableApps.some((a) => a.label === selected);
    if (!stillOffered) {
      setSelected("");
      setAppUrl("");
      setAppStoreUrl("");
      setPlayStoreUrl("");
    }
  }

  // On a phone, Kin knows which store applies to the person filling this
  // in right now, so only that one field needs to show -- the other stays
  // a step away rather than sitting there unused. On a computer there's
  // nothing to detect from, so both show, same as before. Existing data
  // in the field that would otherwise be hidden keeps it open regardless
  // -- editing an account never hides a link that's already saved.
  const otherStoreUrl = kind === "ios" ? playStoreUrl : kind === "android" ? appStoreUrl : "";
  const showBothStores = kind === "other" || showOtherStore || !!otherStoreUrl.trim();

  // The actual rule -- resolve a known app's links, clear them when
  // leaving a known app, otherwise leave hand-typed data alone -- lives in
  // resolveInstitutionLinks (@/lib/wealth), tested on its own in
  // wealth.logic.spec.ts without needing a browser or a login.
  function selectInstitution(value: string) {
    const resolved = resolveInstitutionLinks(value, selected, kind);
    setSelected(value);
    if (resolved) {
      setAppUrl(resolved.appUrl);
      setAppStoreUrl(resolved.appStoreUrl);
      setPlayStoreUrl(resolved.playStoreUrl);
    }
  }

  function test() {
    window.open(appUrl.trim(), "_blank", "noopener,noreferrer");
    setTested(true);
  }

  const isKnownInstitution = isKnownInstitutionLabel(selected);
  // The two store fields are only ever relevant once someone has said
  // "this is a bank Kin doesn't already know" -- before that, on a blank
  // form, there's nothing yet to resolve either way, so they stay hidden
  // rather than showing and then vanishing the moment BANK / WALLET gets
  // an answer. Only "Other" earns them.
  const showStoreFields = selected === "other";
  const looksLikeAppScheme = !!appUrl.trim() && !/^https?:\/\//i.test(appUrl.trim());

  const appStoreField = (
    <div key="app-store" className="field" style={{ flex: 1, marginBottom: "0.625rem" }}>
      <label htmlFor={storeId}>APP STORE LINK (iPHONE){showBothStores && kind === "ios" ? " — your phone" : ""}</label>
      <input
        id={storeId}
        className="input"
        name="app_store_url"
        value={appStoreUrl}
        onChange={(e) => setAppStoreUrl(e.target.value)}
        placeholder="https://apps.apple.com/…"
        style={{ minHeight: "2.625rem" }}
      />
    </div>
  );
  const playStoreField = (
    <div key="play-store" className="field" style={{ flex: 1, marginBottom: "0.625rem" }}>
      <label htmlFor={playId}>PLAY STORE LINK (ANDROID){showBothStores && kind === "android" ? " — your phone" : ""}</label>
      <input
        id={playId}
        className="input"
        name="play_store_url"
        value={playStoreUrl}
        onChange={(e) => setPlayStoreUrl(e.target.value)}
        placeholder="https://play.google.com/…"
        style={{ minHeight: "2.625rem" }}
      />
    </div>
  );
  const otherStoreLabel = kind === "ios" ? "Play Store" : "App Store";
  // "BANK / WALLET" only actually describes two of the seven account types --
  // a credit card's issuer, an investment platform, or "other" all still
  // have a linkable institution or app, just not one that's a bank or a
  // wallet, so the label generalizes for them. Cash has none at all: no
  // institution issues it and no app opens it, so the whole section is
  // skipped rather than asking a question with no answer.
  const institutionFieldLabel = accountType === "bank" || accountType === "ewallet" ? "BANK / WALLET" : "INSTITUTION / APP";
  if (accountType === "cash") return null;

  return (
    <div style={{ marginBottom: "0.25rem" }}>
      <div className="field" style={{ marginBottom: "0.625rem" }}>
        <label htmlFor={institutionId}>{institutionFieldLabel}</label>
        <select
          id={institutionId}
          className="input"
          value={selected}
          onChange={(e) => selectInstitution(e.target.value)}
          style={{ minHeight: "2.625rem" }}
        >
          <option value="">— select —</option>
          {availableApps.map((app) => (
            <option key={app.label} value={app.label}>
              {app.label}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        {selected === "other" && (
          <input
            className="input"
            name="institution"
            aria-label="Bank or wallet name"
            value={customInstitution}
            onChange={(e) => setCustomInstitution(e.target.value)}
            placeholder="e.g. Maya, UnionBank"
            style={{ minHeight: "2.625rem", marginTop: "0.5rem" }}
          />
        )}
        {selected !== "other" && <input type="hidden" name="institution" value={selected} />}
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
          {accountType === "bank" || accountType === "ewallet"
            ? `Narrowed to ${accountType === "bank" ? "banks" : "e-wallets"} — picking one resolves LINK APP below automatically, verified against its own store listing. Anything else: pick Other and type the name.`
            : "Choosing a known name resolves LINK APP below automatically, verified against its own store listing — nothing else to fill in. Anything else: pick Other and type the name."}
        </p>
      </div>

      <div className="field" style={{ marginBottom: "0.625rem" }}>
        <label htmlFor={appId}>Link app</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            id={appId}
            className="input"
            name="linked_app_url"
            value={appUrl}
            onChange={(e) => {
              setAppUrl(e.target.value);
              setTested(false);
            }}
            placeholder={kind === "other" ? "https://www.yourbank.com" : "gcash://"}
            style={{ minHeight: "2.625rem", flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!appUrl.trim()}
            style={{ minHeight: "2.625rem", fontSize: "0.78125rem", padding: "0 0.75rem", whiteSpace: "nowrap" }}
            onClick={test}
          >
            Test
          </button>
        </div>
        {/* A blank tab after TEST reads as broken. That only actually
            happens for a custom scheme like gcash:// with nothing on a
            computer to catch it -- a plain https:// link (a store page, a
            website) opens fine anywhere, so don't warn about those. */}
        {tested && kind === "other" && looksLikeAppScheme && (
          <p style={{ fontSize: "0.78125rem", color: "var(--color-accent-700)", margin: "6px 0 0" }}>
            That likely opened a blank tab — this is a computer, and the app isn&rsquo;t installed here to catch
            the link. Open Kin on your phone and try TEST there to see it actually launch the app.
          </p>
        )}
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
          {isKnownInstitution
            ? "Resolved automatically for this bank or wallet — nothing to fill in below."
            : kind === "other"
              ? "On a phone this would be the app’s own link (opens it directly if it’s installed). On a computer, that mostly doesn’t exist — paste this account’s website link instead, so whoever looks it up here still gets somewhere useful."
              : "The app’s own link, not its website — opens the app itself when it’s already installed. TEST tries it immediately, right here."}
        </p>
      </div>

      {!showStoreFields && (
        <>
          <input type="hidden" name="app_store_url" value={appStoreUrl} />
          <input type="hidden" name="play_store_url" value={playStoreUrl} />
        </>
      )}
      {showStoreFields && (
        <>
          {showBothStores ? (
            <div style={{ display: "flex", gap: "0.625rem" }}>
              {kind === "android" ? [playStoreField, appStoreField] : [appStoreField, playStoreField]}
            </div>
          ) : (
            kind === "ios" ? appStoreField : playStoreField
          )}
          {!showBothStores && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowOtherStore(true)}
              style={{ minHeight: "2.25rem", fontSize: "0.78125rem", padding: "0 0.75rem", marginTop: -4, marginBottom: "0.625rem" }}
            >
              + Also add the {otherStoreLabel} link, for other phones in the household
            </button>
          )}
          <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "-4px 0 0" }}>
            {showBothStores
              ? kind === "other"
                ? "Where to get the app if it isn’t installed yet — paste the link from each store’s own Share button. Optional, and independent of each other: fill in whichever stores apply. Kin opens the right one for whoever’s phone it is when they don’t have the app yet."
                : "Kin detected your own phone and put that store first, labeled “your phone”. Both are saved either way, so anyone in the household gets the right one when they don’t have the app yet."
              : `Kin detected you’re on ${kind === "ios" ? "an iPhone" : "an Android phone"}, so only that store shows. Add the other only if someone else in the household uses the other kind of phone.`}
          </p>
        </>
      )}
    </div>
  );
}

/** `owners`: whose the account can be -- you, the family (joint), and the
 * children whose profiles you keep; `defaultOwner` the one the tab you are
 * on suggests. `grownUp`: whether you may set a joint account's number (you
 * always may on your own). */
export function AddAccountForm({
  owners,
  defaultOwner,
  returnWho,
  grownUp,
  people,
}: {
  owners: { value: string; label: string }[];
  defaultOwner: string;
  returnWho: string;
  grownUp: boolean;
  /** Who else in the household an account of yours can be shown to. */
  people: AccountAudienceMember[];
}) {
  const [owner, setOwner] = useState(defaultOwner);
  // Your own account starts as yours alone, as it always has.
  const [audience, setAudience] = useState<{ mode: AudienceMode; chosen: string[] }>({ mode: "only_me", chosen: [] });
  const canNumber = owner === "me" || (owner === "joint" && grownUp);
  const sym = useCurrencySymbol();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addAccountAction, initialState);
  const [accountType, setAccountType] = useState<AccountType>("bank");


  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "1.125rem" }}
        onClick={() => setOpen(true)}
      >
        + ADD ACCOUNT
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Add account">
        <form action={formAction} style={{ marginTop: "1.125rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
          <input type="hidden" name="return_who" value={returnWho} />
          <ErrorText message={state.error} />
          <Labelled label="Account name">
            <input className="input" name="name" required placeholder="Everyday savings" style={{ minHeight: "2.625rem" }} />
          </Labelled>
          <Labelled label="Whose account">
            <select className="input" name="owner" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ minHeight: "2.625rem" }}>
              {owners.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Labelled>
          {owner === "me" && (
            <div style={{ marginBottom: "0.875rem" }}>
              <div style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.4375rem" }}>Who can see it</div>
              <input type="hidden" name="visibility" value={audience.mode} />
              {audience.mode === "chosen" && audience.chosen.map((id) => <input key={id} type="hidden" name="viewer" value={id} />)}
              <AudienceChoices mode={audience.mode} chosen={audience.chosen} people={people} onChange={(mode, chosen) => setAudience({ mode, chosen })} />
            </div>
          )}
          <Labelled label="Type">
            <select
              className="input"
              name="account_type"
              value={accountType}
              onChange={(e) => setAccountType(e.target.value as AccountType)}
              style={{ minHeight: "2.625rem" }}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Labelled>
          <div style={{ marginBottom: "0.75rem" }}>
            <AppLinksField accountType={accountType} />
          </div>
          <Labelled label={`Opening balance (${sym})`}>
            <input className="input" type="number" step="0.01" inputMode="decimal" name="opening_balance" placeholder="0.00" style={{ minHeight: "2.625rem" }} />
          </Labelled>
          {canNumber && <AccountNumberField />}
          <Labelled label="Note">
            <input className="input" name="sub_note" placeholder="Salary account" style={{ minHeight: "2.625rem" }} />
          </Labelled>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
              Save account
            </SubmitButton>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </FormSheet>
    </>
  );
}

/** Add expense (Jonathan, 26 October): two kinds of expense, one sheet.
 *
 * "Already paid" -- groceries, a meal, fuel, a fare: the money has left, so
 * it is recorded on the day it was paid, out of the account it came from,
 * and the balance drops now (addPaidExpenseAction). No repeat, no reminder,
 * no Settle. "For" ties it to a loan it pays down, an asset or a goal, as
 * Move money does.
 *
 * "Due later" -- a bill: Meralco, tuition, the mortgage. Nothing moves until
 * the day comes; then Today and its line here ask whether it went through
 * (Settle, the amount editable). It keeps the account it comes out of
 * (bills.account_id), repeats if it does, and reminds ahead. Still a row in
 * `bills` through addBillAction, as every due-dated expense always was;
 * only the sheet changed. Opens on "Already paid": the everyday case. */
export type ExpenseTargets = { assets: { id: string; name: string }[]; goals: { id: string; name: string }[]; loans: { id: string; name: string }[] };

export function AddExpenseForm({ whose, accounts, currency, today, targets }: { whose: WhoseOption[]; accounts: PickableAccount[]; currency: string; today: string; targets: ExpenseTargets }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"paid" | "due">("paid");

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "1.125rem" }}
        onClick={() => setOpen(true)}
      >
        + ADD EXPENSE
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Add expense">
        <div role="group" aria-label="Paid already, or due later" style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem" }}>
          {(["paid", "due"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              className={mode === m ? "btn btn-primary" : "btn btn-secondary"}
              style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
              onClick={() => setMode(m)}
            >
              {m === "paid" ? "Already paid" : "Due later"}
            </button>
          ))}
        </div>
        {mode === "paid" ? (
          <PaidExpenseForm whose={whose} accounts={accounts} currency={currency} today={today} targets={targets} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        ) : (
          <DueExpenseForm whose={whose} accounts={accounts} currency={currency} today={today} onCancel={() => setOpen(false)} onDone={() => setOpen(false)} />
        )}
      </FormSheet>
    </>
  );
}

/** The sheet's "Already paid" half. The sheet closes once the entry is in;
 * an error keeps it open with the message at the top. */
function PaidExpenseForm({ whose, accounts, currency, today, targets, onDone, onCancel }: { whose: WhoseOption[]; accounts: PickableAccount[]; currency: string; today: string; targets: ExpenseTargets; onDone: () => void; onCancel: () => void }) {
  const sym = useCurrencySymbol();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await addPaidExpenseAction(prev, fd);
    if (!res.error) onDone();
    return res;
  }, initialState);
  const [category, setCategory] = useState<string>("Groceries");
  // "assets:<id>", "goals:<id>" or "liabilities:<id>", or empty: most
  // expenses are for nothing in particular. A loan picked sets Debt.
  const [against, setAgainst] = useState("");
  const hasTargets = targets.assets.length + targets.goals.length + targets.loans.length > 0;

  if (accounts.length === 0) {
    return (
      <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "1rem", lineHeight: 1.45 }}>
        An expense already paid is recorded out of an account. Add one on the Accounts tab first, or enter this as Due later.
      </p>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: "1rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
      <ErrorText message={state.error} />
      <Labelled label="What it's for">
        <input className="input" name="name" required maxLength={200} placeholder="Groceries, lunch, fuel, a fare…" style={{ minHeight: "2.625rem" }} />
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label={`Amount (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="amount" required style={{ minHeight: "2.625rem" }} />
        </Labelled>
        <Labelled label="Paid on" style={{ flex: 1 }}>
          <DateInput className="input" name="occurred_on" defaultValue={today} required style={{ minHeight: "2.625rem" }} />
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label="Spent on" style={{ flex: 1 }}>
          <select className="input" name="category" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.625rem" }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Paid from" style={{ flex: 1 }}>
          <select className="input" name="account_id" required defaultValue={sortByUse(accounts)[0]?.id ?? ""} style={{ minHeight: "2.625rem" }}>
            <AccountOptions accounts={accounts} currency={currency} />
          </select>
        </Labelled>
      </div>
      {hasTargets && (
        <Labelled label="For (optional)">
          <select
            className="input"
            name="against"
            value={against}
            onChange={(e) => {
              setAgainst(e.target.value);
              if (e.target.value.startsWith("liabilities:")) setCategory("Debt");
            }}
            style={{ minHeight: "2.625rem" }}
          >
            <option value="">Nothing in particular</option>
            {targets.loans.length > 0 && (
              <optgroup label="Paying a loan">
                {targets.loans.map((l) => (
                  <option key={l.id} value={`liabilities:${l.id}`}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            )}
            {targets.assets.length > 0 && (
              <optgroup label="An asset">
                {targets.assets.map((a) => (
                  <option key={a.id} value={`assets:${a.id}`}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            )}
            {targets.goals.length > 0 && (
              <optgroup label="A goal">
                {targets.goals.map((g) => (
                  <option key={g.id} value={`goals:${g.id}`}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Labelled>
      )}
      {/* Money on an asset is upkeep (a living cost), an addition (the
          asset is worth more) or buying it (its value is already on
          record), as Move money asks (20261023232000). */}
      {against.startsWith("assets:") && (
        <Labelled label="What was it?">
          <select className="input" name="asset_use" defaultValue="upkeep" style={{ minHeight: "2.625rem" }}>
            <option value="upkeep">Upkeep — repairs, dues, fuel: a living cost</option>
            <option value="add">Adding to it — it is now worth this much more</option>
            <option value="buy">Buying it, or a down payment</option>
          </select>
        </Labelled>
      )}
      {against.startsWith("liabilities:") && (
        <p style={{ fontSize: "0.78125rem", color: "var(--color-neutral-600)", margin: "-0.25rem 0 0.75rem", lineHeight: 1.45 }}>
          Kin splits it into interest and the part that pays the loan down, from the loan&apos;s rate; the loan&apos;s balance drops by that part.
        </p>
      )}
      <Labelled label="Whose is it?">
        <WhoseSelect name="whose" options={whose} />
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
          Save expense
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The sheet's "Due later" half: a bill. Due on starts on today and is
 * required, so every bill reaches Today, the calendar and its reminder. */
function DueExpenseForm({ whose, accounts, currency, today, onDone, onCancel }: { whose: WhoseOption[]; accounts: PickableAccount[]; currency: string; today: string; onDone: () => void; onCancel: () => void }) {
  const sym = useCurrencySymbol();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await addBillAction(prev, fd);
    if (!res.error) onDone();
    return res;
  }, initialState);
  // A weekly bill is due again within the week, so its reminder comes at
  // most 3 days ahead (weeklyRemindDays).
  const [recurrence, setRecurrence] = useState("monthly");
  const remindChoices = recurrence === "weekly" ? BILL_REMIND_DAYS.filter((d) => d <= WEEKLY_REMIND_MAX) : BILL_REMIND_DAYS;

  return (
    <form action={formAction} style={{ marginTop: "1rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
      <ErrorText message={state.error} />
      <Labelled label="What it's for">
        <input className="input" name="name" required placeholder="Electric bill, tuition, mortgage…" style={{ minHeight: "2.625rem" }} />
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label={`Amount (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="amount" required style={{ minHeight: "2.625rem" }} />
        </Labelled>
        <Labelled label="Due on" style={{ flex: 1 }}>
          <DateInput className="input" name="due_date" defaultValue={today} required style={{ minHeight: "2.625rem" }} />
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label="Spent on" style={{ flex: 1 }}>
          <select className="input" name="category" defaultValue="Utilities" style={{ minHeight: "2.625rem" }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Repeats" style={{ flex: 1 }}>
          <select className="input" name="recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value)} style={{ minHeight: "2.625rem" }}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="once">One-off</option>
          </select>
        </Labelled>
      </div>
      {/* Which account it comes out of: the one Settle then starts on.
          Most used first, as every money form; or left for later, for a
          bill paid from wherever has money that day. No accounts yet:
          nothing to choose. */}
      {accounts.length > 0 && (
        <Labelled label="Paid from">
          <select className="input" name="account_id" defaultValue={sortByUse(accounts)[0]?.id ?? ""} style={{ minHeight: "2.625rem" }}>
            <AccountOptions accounts={accounts} currency={currency} />
            <option value="">Decide when settling</option>
          </select>
        </Labelled>
      )}
      <Labelled label="Whose is it?">
        <WhoseSelect name="whose" options={whose} />
      </Labelled>
      <Labelled label="Remind me">
        <select key={recurrence === "weekly" ? "weekly" : "longer"} className="input" name="remind_days_before" defaultValue={DEFAULT_BILL_REMIND_DAYS} style={{ minHeight: "2.625rem" }}>
          {remindChoices.map((d) => (
            <option key={d} value={d}>
              {remindLabel(d)}
            </option>
          ))}
        </select>
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
          Save expense
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function remindLabel(days: number): string {
  return days === 1 ? "The day before" : `${days} days before`;
}

/** A bill's own "remind me" setting, changed in place on its row. The push
 * and Today's line come this many days ahead; the day before and the day
 * itself always follow. */
export function BillReminderPicker({ billId, days, weekly = false }: { billId: string; days: number; weekly?: boolean }) {
  const [value, setValue] = useState(days);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const offered = BILL_REMIND_DAYS.filter((d) => !weekly || d <= WEEKLY_REMIND_MAX);
  const options: number[] = (offered as readonly number[]).includes(days) ? [...offered] : [...offered, days].sort((a, b) => a - b);
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", fontSize: "0.78125rem", color: "var(--color-neutral-600)" }}>
      <span>Remind</span>
      <select
        className="input"
        aria-label="Remind me"
        value={value}
        disabled={pending}
        style={{ minHeight: "2rem", padding: "0 0.5rem", fontSize: "0.78125rem", width: "auto" }}
        onChange={(e) => {
          const next = Number(e.target.value);
          const before = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const res = await setBillReminderAction(billId, next);
            if (res.error) {
              setValue(before);
              setError(res.error);
            }
          });
        }}
      >
        {options.map((d) => (
          <option key={d} value={d}>
            {remindLabel(d).toLowerCase()}
          </option>
        ))}
      </select>
      {error && <span role="alert" style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </label>
  );
}

export function AddIncomeScheduleForm({ accounts, whose, openLent = [], currency, grownUp = false, today }: { accounts: { id: string; name: string }[]; whose: WhoseOption[]; openLent?: OpenLent[]; currency: string; grownUp?: boolean; /** The household's day: what every date here starts on. */ today?: string }) {
  const sym = useCurrencySymbol();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addIncomeScheduleAction, initialState);
  // A regular income -- set up once, each payment lined up after the last
  // (income_groups) -- or a single payment. Grown-ups only, like the logs.
  const [mode, setMode] = useState<"once" | "regular">("once");
  // Category first: Remittance from abroad and Utang & paluwagan open the
  // fields their own logs keep (income-category-extras).
  const [category, setCategory] = useState<string>("Salary");
  const categories = [...INCOME_SOURCES, ...(grownUp ? [UTANG_CATEGORY] : [])];


  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: "2.875rem", fontSize: "0.875rem", letterSpacing: ".04em", marginTop: "1.125rem" }}
        onClick={() => setOpen(true)}
      >
        + ADD INCOME
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Add income">
        {grownUp && (
          <div style={{ marginTop: "0.75rem" }}>
            <div role="group" aria-label="What kind of income" style={{ display: "flex", gap: "0.5rem", marginTop: "0.875rem" }}>
              {(["once", "regular"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  className={mode === m ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ flex: 1, minHeight: "2.5rem", fontSize: "0.84375rem" }}
                  onClick={() => setMode(m)}
                >
                  {m === "once" ? "One payment" : "Regular income"}
                </button>
              ))}
            </div>
          </div>
        )}
        {grownUp && mode === "regular" ? (
          <IncomeGroupForm accounts={accounts} whose={whose} today={today} onCancel={() => setOpen(false)} />
        ) : (
        <div style={{ marginTop: "1.125rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
          <Labelled label="Category">
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.625rem" }}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </Labelled>
          {grownUp && category === "Remittance" ? (
            <RemittanceFields accounts={accounts} onDone={() => setOpen(false)} />
          ) : grownUp && category === UTANG_CATEGORY ? (
            <UtangFields openLent={openLent} currency={currency} onDone={() => setOpen(false)} />
          ) : (
        <form action={formAction}>
          <ErrorText message={state.error} />
          <input type="hidden" name="category" value={category} />
          <Labelled label="Source">
            <input className="input" name="name" required placeholder="BPI payroll, Unit 2B rent" style={{ minHeight: "2.625rem" }} />
          </Labelled>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <Labelled label={`Amount (${sym})`} style={{ flex: 1 }}>
              <input className="input" type="number" step="0.01" min="0" name="amount" required style={{ minHeight: "2.625rem" }} />
            </Labelled>
            <Labelled label="Expected on" style={{ flex: 1 }}>
              <DateInput className="input" name="next_date" defaultValue={today} style={{ minHeight: "2.625rem" }} />
            </Labelled>
          </div>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <Labelled label="Repeats" style={{ flex: 1 }}>
              <select className="input" name="recurrence" defaultValue="monthly" style={{ minHeight: "2.625rem" }}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
                <option value="once">One-off</option>
              </select>
            </Labelled>
          </div>
          {accounts.length > 0 && (
            <Labelled label="Deposited to account">
              <select className="input" name="account_id" defaultValue="" style={{ minHeight: "2.625rem" }}>
                <option value="">Choose later</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Labelled>
          )}
          <Labelled label="Whose is it?">
            <WhoseSelect name="whose" options={whose} />
          </Labelled>
          <div style={{ display: "flex", gap: "0.625rem" }}>
            <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
              Save
            </SubmitButton>
            <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
          )}
        </div>
        )}
      </FormSheet>
    </>
  );
}

/** A regular income, set up once: what it is, its usual amount, how often,
 * when the next one comes, and if wanted a monthly target. */
function IncomeGroupForm({ accounts, whose, today, onCancel }: { accounts: { id: string; name: string }[]; whose: WhoseOption[]; today?: string; onCancel: () => void }) {
  const sym = useCurrencySymbol();
  const [state, formAction] = useActionState(addIncomeGroupAction, initialState);
  return (
    <form action={formAction} style={{ marginTop: "1.125rem", borderTop: "1px solid var(--color-divider)", paddingTop: "1rem" }}>
      <ErrorText message={state.error} />
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label="Category" style={{ flex: 1 }}>
          <select className="input" name="category" defaultValue="Salary" style={{ minHeight: "2.625rem" }}>
            {INCOME_SOURCES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="How often" style={{ flex: 1 }}>
          <select className="input" name="frequency" defaultValue="monthly" style={{ minHeight: "2.625rem" }}>
            {Object.entries(INCOME_FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Labelled>
      </div>
      <Labelled label="Source">
        <input className="input" name="name" required maxLength={80} placeholder="BPI payroll, rice business" style={{ minHeight: "2.625rem" }} />
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <Labelled label={`Usual amount (${sym})`} style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="usual_amount" required style={{ minHeight: "2.625rem" }} />
        </Labelled>
        <Labelled label="Next one expected" style={{ flex: 1 }}>
          <DateInput className="input" name="first_date" defaultValue={today} required style={{ minHeight: "2.625rem" }} />
        </Labelled>
      </div>
      <Labelled label={`Monthly target (${sym}, optional)`}>
        <input className="input" type="number" step="0.01" min="0" name="monthly_target" style={{ minHeight: "2.625rem" }} />
      </Labelled>
      {accounts.length > 0 && (
        <Labelled label="Deposited to account">
          <select className="input" name="account_id" defaultValue="" style={{ minHeight: "2.625rem" }}>
            <option value="">Choose later</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Labelled>
      )}
      <Labelled label="Whose is it?">
        <WhoseSelect name="whose" options={whose} />
      </Labelled>
      <div style={{ display: "flex", gap: "0.625rem" }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }}>
          Set up
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: "2.625rem", fontSize: "0.875rem" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SetTargetControl({ month, year, current }: { month: number; year: number; current: number }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
      <AmountInput ariaLabel="Amount" defaultValue={value} onValueChange={setValue} style={{ minHeight: "2.5rem" }} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: "2.5rem", fontSize: "0.84375rem", whiteSpace: "nowrap" }}
        onClick={() =>
          startTransition(async () => {
            const { error } = await setWealthTargetAction(month, year, value);
            setFailed(error);
          })
        }
      >
        {pending ? "…" : "Set target"}
      </button>
      {/* This used to fail by going quiet, which is exactly what it did when
          it succeeded. */}
      {failed && (
        <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", alignSelf: "center" }}>
          {failed}
        </p>
      )}
    </div>
  );
}

/** One category under BUDGET VS SPEND BY CATEGORY: what was spent, against
 * its budget if it has one, with what is left or over under the bar. Whoever
 * may set this budget taps the row (26 October) -- a sheet to change or
 * remove it, or, with no budget yet, to set one. Saving 0 from this month
 * on is removing it. `whose` is Family ("family") or a member id. */
export function CategoryBudgetRow({
  whose,
  category,
  amount,
  spent,
  currency,
  color,
  canEdit,
  children,
}: {
  whose: string;
  category: string;
  amount: number;
  spent: number;
  currency: string;
  color: string;
  canEdit: boolean;
  /** Its expenses, under the bar (26 October). */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(amount);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const label = categoryLabel(category);
  const budgeted = amount > 0;
  const pct = budgeted ? Math.min(100, Math.round((spent / amount) * 100)) : 0;
  const over = budgeted && spent > amount;
  const save = (next: number) =>
    startTransition(async () => {
      const { error } = await setSpendingBudgetAction({ whose, category, amount: next });
      setFailed(error);
      if (!error) {
        setOpen(false);
        router.refresh();
      }
    });

  const body = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.84375rem", marginBottom: "0.25rem" }}>
        <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", marginRight: "0.0625rem", flex: "none" }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {!budgeted && <span style={{ fontSize: "0.75rem", color: canEdit ? "var(--color-switch-on)" : "var(--color-neutral-600)", flex: "none" }}>{canEdit ? "set budget" : "no budget"}</span>}
        {/* Never cut off (26 October): the amount keeps its width and the
            name gives way. */}
        <span style={{ marginLeft: "auto", flex: "none", whiteSpace: "nowrap", fontFamily: "var(--font-numeric)", fontSize: "0.8125rem", paddingLeft: "0.5rem" }}>
          {formatCurrency(spent, currency)}
          {budgeted ? ` / ${formatCurrency(amount, currency)}` : ""}
        </span>
      </div>
      {/* A bar only against a budget (26 October): with none it measured
          nothing. */}
      {budgeted && (
        <div style={{ height: 7, background: "var(--color-neutral-200)" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: over ? "var(--color-accent-700)" : color }} />
        </div>
      )}
      {budgeted && (
        <div style={{ fontSize: "0.75rem", marginTop: "0.1875rem", color: over ? "var(--color-accent-700)" : "var(--color-neutral-600)" }}>
          {over ? `${formatCurrency(spent - amount, currency)} over` : `${formatCurrency(amount - spent, currency)} left`}
        </div>
      )}
    </>
  );

  if (!canEdit)
    return (
      <>
        <div style={{ marginBottom: "0.6875rem" }}>{body}</div>
        {children}
      </>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setValue(amount);
          setFailed(null);
          setOpen(true);
        }}
        aria-label={budgeted ? `${label}: change or remove its budget` : `${label}: set a budget`}
        style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: 0, padding: 0, margin: "0 0 0.6875rem", color: "inherit", font: "inherit", cursor: "pointer" }}
      >
        {body}
      </button>
      {children}
      <FormSheet open={open} onClose={() => setOpen(false)} title={`${label} budget`}>
        <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>
          {formatCurrency(spent, currency)} spent this month.{budgeted ? "" : " Set how much to spend on it each month."}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <AmountInput key={String(open)} ariaLabel="Amount" defaultValue={amount || undefined} onValueChange={setValue} style={{ minHeight: "2.5rem", flex: 1 }} />
          <button type="button" className="btn btn-primary" disabled={pending || !(value > 0)} style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }} onClick={() => save(value)}>
            {pending ? "…" : "Save"}
          </button>
        </div>
        {failed && <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", margin: "0 0 0.75rem" }}>{failed}</p>}
        {budgeted && (
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={pending}
            style={{ minHeight: "2.5rem", fontSize: "0.84375rem", color: "var(--color-accent-700)", marginBottom: "0.75rem" }}
            onClick={async () => {
              if (!(await confirm({ title: `Remove the ${label} budget?`, description: "From this month on. What was spent stays; it just shows with no budget.", confirmLabel: "Remove", danger: true }))) return;
              save(0);
            }}
          >
            Remove budget
          </button>
        )}
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 1rem" }}>It repeats every month until you change or remove it.</p>
      </FormSheet>
    </>
  );
}

/** Sets what Family or one person intends to spend per category, from this
 * month on until changed — the bars above it fill with what was actually
 * spent. */
export function AllocationEditor({ whose, budgeted }: { whose: string; budgeted: string[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES.find((c) => !budgeted.includes(c)) ?? EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();


  return (
    <>
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: "1.125rem" }} onClick={() => setOpen(true)}>
        Set a category budget
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Category budget">
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.125rem" }}>
          <select aria-label="Category" className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: "2.5rem", flex: 1 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <AmountInput ariaLabel="Amount" defaultValue={amount} onValueChange={setAmount} style={{ minHeight: "2.5rem", width: 96 }} />
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || !(amount > 0)}
            style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
            onClick={() =>
              startTransition(async () => {
                const { error } = await setSpendingBudgetAction({ whose, category, amount });
                setFailed(error);
                if (error) return;
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? "…" : "SET"}
          </button>
        </div>
        {failed && <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", margin: "-0.5rem 0 1rem" }}>{failed}</p>}
        <p style={{ fontSize: "0.75rem", color: "var(--color-neutral-600)", margin: "0 0 1rem" }}>It repeats every month until you change or remove it.</p>
      </FormSheet>
    </>
  );
}

/** Who sees a grown-up's own budgets (26 October), chosen as for an
 * account: every grown-up (the default), only them, or people picked. */
export function BudgetVisibility({ isPrivate, viewers, people }: { isPrivate: boolean; viewers: string[]; people: AccountAudienceMember[] }) {
  const startMode: AudienceMode = !isPrivate ? "everyone" : viewers.length ? "chosen" : "only_me";
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AudienceMode>(startMode);
  const [chosen, setChosen] = useState<string[]>(viewers);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const label = startMode === "everyone" ? "All grown-ups" : startMode === "only_me" ? "Only you" : `${viewers.length} ${viewers.length === 1 ? "person" : "people"}`;
  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", minHeight: "2rem", fontSize: "0.75rem", padding: "0 0.5rem", margin: "-0.25rem 0 0.75rem" }}
        onClick={() => {
          setMode(startMode);
          setChosen(viewers);
          setOpen(true);
        }}
      >
        Who sees your budget: {label} ›
      </button>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Who can see your budget">
        <AudienceChoices
          mode={mode}
          chosen={chosen}
          people={people}
          seen="your category budgets"
          onChange={(m, c) => {
            setMode(m);
            setChosen(c);
          }}
        />
        {failed && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>{failed}</p>}
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          style={{ width: "100%", minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.75rem" }}
          onClick={() =>
            startTransition(async () => {
              const { error } = await setBudgetVisibilityAction({ mode, memberIds: chosen });
              setFailed(error);
              if (error) return;
              setOpen(false);
              router.refresh();
            })
          }
        >
          {pending ? "…" : "Save"}
        </button>
      </FormSheet>
    </>
  );
}

/** Ties the caption to the control it captions. useId rather than the field's
 * name, because these forms repeat -- the wealth page carries two "NAME"
 * fields -- and a duplicated id would point every caption at whichever
 * control rendered first. The association is what makes a screen reader
 * announce the field, and what makes tapping the caption focus it. */
function Labelled({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  const id = useId();
  return (
    <div className="field" style={{ marginBottom: "0.75rem", ...style }}>
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}
