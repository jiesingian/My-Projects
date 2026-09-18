"use client";

import { cloneElement, isValidElement, useActionState, useId, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccountAction,
  setJointBudgetAction,
  setWealthTargetAction,
  setAllocationAction,
  addBillAction,
  addIncomeScheduleAction,
} from "@/lib/actions/wealth";
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_SOURCES,
  knownAppsForType,
  isKnownInstitutionLabel,
  resolveInstitutionLinks,
  type AccountType,
} from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";

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
 * GET APP button gets the right one for whoever views it later, on
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
    <div key="app-store" className="field" style={{ flex: 1, marginBottom: 10 }}>
      <label htmlFor={storeId}>APP STORE LINK (iPHONE){showBothStores && kind === "ios" ? " — your phone" : ""}</label>
      <input
        id={storeId}
        className="input"
        name="app_store_url"
        value={appStoreUrl}
        onChange={(e) => setAppStoreUrl(e.target.value)}
        placeholder="https://apps.apple.com/…"
        style={{ minHeight: 42 }}
      />
    </div>
  );
  const playStoreField = (
    <div key="play-store" className="field" style={{ flex: 1, marginBottom: 10 }}>
      <label htmlFor={playId}>PLAY STORE LINK (ANDROID){showBothStores && kind === "android" ? " — your phone" : ""}</label>
      <input
        id={playId}
        className="input"
        name="play_store_url"
        value={playStoreUrl}
        onChange={(e) => setPlayStoreUrl(e.target.value)}
        placeholder="https://play.google.com/…"
        style={{ minHeight: 42 }}
      />
    </div>
  );
  const otherStoreLabel = kind === "ios" ? "Play Store" : "App Store";
  // "BANK / WALLET" only actually describes two of the six account types --
  // a credit card's issuer, an investment platform, or "other" all still
  // have a linkable institution or app, just not one that's a bank or a
  // wallet, so the label generalizes for them. Cash has none at all: no
  // institution issues it and no app opens it, so the whole section is
  // skipped rather than asking a question with no answer.
  const institutionFieldLabel = accountType === "bank" || accountType === "ewallet" ? "BANK / WALLET" : "INSTITUTION / APP";
  if (accountType === "cash") return null;

  return (
    <div style={{ marginBottom: 4 }}>
      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={institutionId}>{institutionFieldLabel}</label>
        <select
          id={institutionId}
          className="input"
          value={selected}
          onChange={(e) => selectInstitution(e.target.value)}
          style={{ minHeight: 42 }}
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
            style={{ minHeight: 42, marginTop: 8 }}
          />
        )}
        {selected !== "other" && <input type="hidden" name="institution" value={selected} />}
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
          {accountType === "bank" || accountType === "ewallet"
            ? `Narrowed to ${accountType === "bank" ? "banks" : "e-wallets"} — picking one resolves LINK APP below automatically, verified against its own store listing. Anything else: pick Other and type the name.`
            : "Choosing a known name resolves LINK APP below automatically, verified against its own store listing — nothing else to fill in. Anything else: pick Other and type the name."}
        </p>
      </div>

      <div className="field" style={{ marginBottom: 10 }}>
        <label htmlFor={appId}>LINK APP</label>
        <div style={{ display: "flex", gap: 8 }}>
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
            style={{ minHeight: 42, flex: 1 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!appUrl.trim()}
            style={{ minHeight: 42, fontSize: 12.5, padding: "0 12px", whiteSpace: "nowrap" }}
            onClick={test}
          >
            TEST
          </button>
        </div>
        {/* A blank tab after TEST reads as broken. That only actually
            happens for a custom scheme like gcash:// with nothing on a
            computer to catch it -- a plain https:// link (a store page, a
            website) opens fine anywhere, so don't warn about those. */}
        {tested && kind === "other" && looksLikeAppScheme && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent-700)", margin: "6px 0 0" }}>
            That likely opened a blank tab — this is a computer, and the app isn&rsquo;t installed here to catch
            the link. Open Kin on your phone and try TEST there to see it actually launch the app.
          </p>
        )}
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
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
            <div style={{ display: "flex", gap: 10 }}>
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
              style={{ minHeight: 36, fontSize: 12.5, padding: "0 12px", marginTop: -4, marginBottom: 10 }}
            >
              + Also add the {otherStoreLabel} link, for other phones in the household
            </button>
          )}
          <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "-4px 0 0" }}>
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

export function AddAccountForm({ isJoint }: { isJoint: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addAccountAction, initialState);
  const [accountType, setAccountType] = useState<AccountType>("bank");

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
        onClick={() => setOpen(true)}
      >
        + ADD ACCOUNT
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <input type="hidden" name="is_joint" value={isJoint ? "on" : ""} />
      <ErrorText message={state.error} />
      <Labelled label="ACCOUNT NAME">
        <input className="input" name="name" required placeholder="Everyday savings" style={{ minHeight: 42 }} />
      </Labelled>
      <Labelled label="TYPE">
        <select
          className="input"
          name="account_type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as AccountType)}
          style={{ minHeight: 42 }}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ACCOUNT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Labelled>
      <div style={{ marginBottom: 12 }}>
        <AppLinksField accountType={accountType} />
      </div>
      <Labelled label="OPENING BALANCE (₱)">
        <input className="input" type="number" step="0.01" name="opening_balance" defaultValue={0} style={{ minHeight: 42 }} />
      </Labelled>
      <Labelled label="NOTE">
        <input className="input" name="sub_note" placeholder="Salary account" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE ACCOUNT
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

/** Despite the name, this covers every kind of expense, due-dated or not --
 * a mortgage payment, groceries, a checkup, fuel, same as a recurring bill.
 * "once" under REPEATS is how a one-off expense is entered here. Renamed
 * addBillAction/bills throughout the code would be a much bigger change for
 * no functional gain, so only the copy shown to a member changed. */
export function AddBillForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addBillAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
        onClick={() => setOpen(true)}
      >
        + ADD EXPENSE
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <ErrorText message={state.error} />
      <Labelled label="EXPENSE">
        <input className="input" name="name" required placeholder="Meralco, groceries, mortgage…" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="AMOUNT (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="amount" required style={{ minHeight: 42 }} />
        </Labelled>
        <Labelled label="DUE" style={{ flex: 1 }}>
          <DateInput className="input" name="due_date" style={{ minHeight: 42 }} />
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="CATEGORY" style={{ flex: 1 }}>
          <select className="input" name="category" defaultValue="Utilities" style={{ minHeight: 42 }}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="REPEATS" style={{ flex: 1 }}>
          <select className="input" name="recurrence" defaultValue="monthly" style={{ minHeight: 42 }}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="once">One-off</option>
          </select>
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE EXPENSE
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

export function AddIncomeScheduleForm({ accounts }: { accounts: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addIncomeScheduleAction, initialState);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-primary btn-block"
        style={{ minHeight: 46, fontSize: 14, letterSpacing: ".04em", marginTop: 18 }}
        onClick={() => setOpen(true)}
      >
        + ADD INCOME
      </button>
    );
  }

  return (
    <form action={formAction} style={{ marginTop: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 16 }}>
      <ErrorText message={state.error} />
      <Labelled label="SOURCE">
        <input className="input" name="name" required placeholder="Salary" style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="AMOUNT (₱)" style={{ flex: 1 }}>
          <input className="input" type="number" step="0.01" min="0" name="amount" required style={{ minHeight: 42 }} />
        </Labelled>
        <Labelled label="EXPECTED" style={{ flex: 1 }}>
          <DateInput className="input" name="next_date" style={{ minHeight: 42 }} />
        </Labelled>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="CATEGORY" style={{ flex: 1 }}>
          <select className="input" name="category" defaultValue="Salary" style={{ minHeight: 42 }}>
            {INCOME_SOURCES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="REPEATS" style={{ flex: 1 }}>
          <select className="input" name="recurrence" defaultValue="monthly" style={{ minHeight: 42 }}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="once">One-off</option>
          </select>
        </Labelled>
      </div>
      {accounts.length > 0 && (
        <Labelled label="USUALLY LANDS IN">
          <select className="input" name="account_id" defaultValue="" style={{ minHeight: 42 }}>
            <option value="">Not decided yet</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Labelled>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--color-neutral-700)", margin: "2px 0 12px" }}>
        <input type="checkbox" name="is_joint" defaultChecked />
        Household income, not just mine
      </label>
      <div style={{ display: "flex", gap: 10 }}>
        <SubmitButton className="btn btn-primary" style={{ flex: 1, minHeight: 42, fontSize: 14 }}>
          SAVE
        </SubmitButton>
        <button type="button" className="btn btn-secondary" style={{ flex: 1, minHeight: 42, fontSize: 14 }} onClick={() => setOpen(false)}>
          CANCEL
        </button>
      </div>
    </form>
  );
}

export function SetBudgetControl({ month, year, current }: { month: number; year: number; current: number }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: 40 }} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5, whiteSpace: "nowrap" }}
        onClick={() =>
          startTransition(async () => {
            const { error } = await setJointBudgetAction(month, year, value);
            setFailed(error);
          })
        }
      >
        {pending ? "…" : "SET BUDGET"}
      </button>
      {/* This used to fail by going quiet, which is exactly what it did when
          it succeeded. */}
      {failed && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-accent-700)", alignSelf: "center" }}>
          {failed}
        </p>
      )}
    </div>
  );
}

export function SetTargetControl({ month, year, current }: { month: number; year: number; current: number }) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input className="input" type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ minHeight: 40 }} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5, whiteSpace: "nowrap" }}
        onClick={() =>
          startTransition(async () => {
            const { error } = await setWealthTargetAction(month, year, value);
            setFailed(error);
          })
        }
      >
        {pending ? "…" : "SET TARGET"}
      </button>
      {/* This used to fail by going quiet, which is exactly what it did when
          it succeeded. */}
      {failed && (
        <p role="alert" style={{ fontSize: 13, color: "var(--color-accent-700)", alignSelf: "center" }}>
          {failed}
        </p>
      )}
    </div>
  );
}

/** Sets what the household intends to spend per category this month — the
 * bars above it fill with what was actually spent. */
export function AllocationEditor({ budgeted }: { budgeted: string[] }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES.find((c) => !budgeted.includes(c)) ?? EXPENSE_CATEGORIES[0]);
  const [amount, setAmount] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block" style={{ minHeight: 40, fontSize: 13.5, marginBottom: 18 }} onClick={() => setOpen(true)}>
        SET A CATEGORY BUDGET
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)} style={{ minHeight: 40, flex: 1 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input className="input" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ minHeight: 40, width: 96 }} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 13.5 }}
        onClick={() =>
          startTransition(async () => {
            await setAllocationAction({ category, amount });
            setOpen(false);
            router.refresh();
          })
        }
      >
        {pending ? "…" : "SET"}
      </button>
    </div>
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
    <div className="field" style={{ marginBottom: 12, ...style }}>
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children) ? cloneElement(children, { id }) : children}
    </div>
  );
}
