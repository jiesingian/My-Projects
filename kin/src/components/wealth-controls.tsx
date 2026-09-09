"use client";

import { cloneElement, isValidElement, useActionState, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAccountAction,
  setJointBudgetAction,
  setWealthTargetAction,
  setAllocationAction,
  addBillAction,
  addIncomeScheduleAction,
} from "@/lib/actions/wealth";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, EXPENSE_CATEGORIES, INCOME_SOURCES } from "@/lib/wealth";
import type { ActionState } from "@/lib/actions/auth";
import { SubmitButton, ErrorText } from "@/components/form";
import { DateInput } from "@/components/date-input";

const initialState: ActionState = { error: null };

/** One tap instead of typing, for the handful of apps whose links are
 * confirmed correct and unlikely to change. Deliberately short: a wrong
 * entry here is worse than none, and most apps -- every Philippine bank's
 * included -- publish no such thing anywhere a person or an AI could look
 * one up to add with any confidence.
 *
 * appUrl is the app's own scheme, opened when it's already installed
 * (verified against PayMongo's GCash integration docs). appStoreUrl and
 * playStoreUrl are where to get the app in the first place, verified
 * against each bank's actual store listing -- BPI's iOS id and Android
 * package from Apple's and Google's own listings, BDO's the same, cross-
 * checked against BDO Unibank as the publisher. */
const KNOWN_APPS: { label: string; appUrl?: string; appStoreUrl?: string; playStoreUrl?: string }[] = [
  { label: "GCash", appUrl: "gcash://" },
  {
    label: "BPI",
    appStoreUrl: "https://apps.apple.com/ph/app/bpi/id6443950982",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.bpi.ng.app",
  },
  {
    label: "BDO",
    appStoreUrl: "https://apps.apple.com/ph/app/bdo-online/id1551584630",
    playStoreUrl: "https://play.google.com/store/apps/details?id=ph.com.bdo.retail",
  },
];

/** Rough and deliberately so -- this only decides which explanation or
 * which store link to act on, never whether a field or button works, so a
 * wrong guess costs nothing. */
export function phoneKind(): "ios" | "android" | "other" {
  if (typeof navigator === "undefined") return "other";
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
  if (/Android/i.test(navigator.userAgent)) return "android";
  return "other";
}

/** Three independent links for one account: the app's own (opened when
 * it's already installed), and where to get it on each store (opened when
 * it isn't). No web page, Kin included, can list a phone's installed apps
 * or read back which one a person picked from the OS's own share sheet --
 * that is a privacy boundary every browser enforces, not a gap in this
 * form. Typing a link and confirming it works, or pointing at the right
 * store for the phone in hand, is the closest thing to "choose from
 * installed apps" a website is able to offer. */
export function AppLinksField({
  defaultAppUrl,
  defaultAppStoreUrl,
  defaultPlayStoreUrl,
}: {
  defaultAppUrl?: string;
  defaultAppStoreUrl?: string;
  defaultPlayStoreUrl?: string;
}) {
  const [appUrl, setAppUrl] = useState(defaultAppUrl ?? "");
  const [appStoreUrl, setAppStoreUrl] = useState(defaultAppStoreUrl ?? "");
  const [playStoreUrl, setPlayStoreUrl] = useState(defaultPlayStoreUrl ?? "");
  const [tested, setTested] = useState(false);
  const appId = useId();
  const storeId = useId();
  const playId = useId();

  function fillKnown(app: (typeof KNOWN_APPS)[number]) {
    setAppUrl(app.appUrl ?? "");
    setAppStoreUrl(app.appStoreUrl ?? "");
    setPlayStoreUrl(app.playStoreUrl ?? "");
  }

  function test() {
    window.open(appUrl.trim(), "_blank", "noopener,noreferrer");
    setTested(true);
  }

  const isKnown = (app: (typeof KNOWN_APPS)[number]) =>
    appUrl === (app.appUrl ?? "") && appStoreUrl === (app.appStoreUrl ?? "") && playStoreUrl === (app.playStoreUrl ?? "");

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {KNOWN_APPS.map((app) => (
          <button key={app.label} type="button" className="chip" data-active={isKnown(app)} onClick={() => fillKnown(app)}>
            {app.label}
          </button>
        ))}
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
            placeholder="gcash://"
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
        {/* A blank tab after TEST reads as broken. On a phone it usually
            means the link was wrong; on a computer it is expected every
            time -- GCash and most linked apps only exist on a phone, so
            there is nothing here to catch the link. */}
        {tested && phoneKind() === "other" && (
          <p style={{ fontSize: 12.5, color: "var(--color-accent-700)", margin: "6px 0 0" }}>
            That likely opened a blank tab — this is a computer, and the app isn&rsquo;t installed here to catch
            the link. Open Kin on your phone and try TEST there to see it actually launch the app.
          </p>
        )}
        <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "6px 0 0" }}>
          The app&rsquo;s own link, not its website — opens the app itself when it&rsquo;s already installed. TEST
          tries it immediately, right here.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div className="field" style={{ flex: 1, marginBottom: 10 }}>
          <label htmlFor={storeId}>APP STORE LINK (iPHONE)</label>
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
        <div className="field" style={{ flex: 1, marginBottom: 10 }}>
          <label htmlFor={playId}>PLAY STORE LINK (ANDROID)</label>
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
      </div>
      <p style={{ fontSize: 12.5, color: "var(--color-neutral-600)", margin: "-4px 0 0" }}>
        Where to get the app if it isn&rsquo;t installed yet — paste the link from each store&rsquo;s own Share
        button. Optional, and independent of each other: fill in whichever stores apply. Kin opens the right one
        for whoever&rsquo;s phone it is when they don&rsquo;t have the app yet.
      </p>
    </div>
  );
}

export function AddAccountForm({ isJoint }: { isJoint: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addAccountAction, initialState);

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
      <div style={{ display: "flex", gap: 10 }}>
        <Labelled label="TYPE" style={{ flex: 1 }}>
          <select className="input" name="account_type" defaultValue="bank" style={{ minHeight: 42 }}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="BANK / WALLET" style={{ flex: 1 }}>
          <input className="input" name="institution" placeholder="BPI" style={{ minHeight: 42 }} />
        </Labelled>
      </div>
      <Labelled label="OPENING BALANCE (₱)">
        <input className="input" type="number" step="0.01" name="opening_balance" defaultValue={0} style={{ minHeight: 42 }} />
      </Labelled>
      <div style={{ marginBottom: 12 }}>
        <AppLinksField />
      </div>
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
        <p role="alert" style={{ fontSize: 13, color: "var(--danger, #d33)", alignSelf: "center" }}>
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
        <p role="alert" style={{ fontSize: 13, color: "var(--danger, #d33)", alignSelf: "center" }}>
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
