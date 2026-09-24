"use client";

import { useId, useTransition } from "react";
import { setThemeAction, setTextScaleAction, setPaletteAction, createCalendarFeedAction, removeCalendarFeedAction, toggleNotificationAction, updateHouseholdNameAction, updateHouseholdPrefsAction } from "@/lib/actions/settings";
import { regenerateInviteCodeAction } from "@/lib/actions/family";
import { disconnectDriveAction } from "@/lib/actions/drive";
import { migrateProfilePhotosToDriveAction } from "@/lib/actions/photo-migration";
import { disconnectCalendarAction, syncGoogleCalendarAction } from "@/lib/actions/calendar-sync";
import { useState } from "react";
import { confirm } from "@/components/confirm-sheet";
import { TEXT_SCALE_DEFAULT, TEXT_SCALE_MAX, TEXT_SCALE_MIN } from "@/lib/text-scale";
import { CopyInviteCode } from "@/components/copy-invite-code";
import { Blueprint } from "@/components/ui";
import { NOTIFICATION_DEFS } from "@/lib/notifications";
import { CURRENCIES, DATE_FORMATS, WEEK_STARTS } from "@/lib/household-prefs";
import { familyDateTime } from "@/lib/time";
import { COUNTRIES } from "@/lib/countries";
import { PALETTES, type PaletteMode } from "@/lib/palettes";

export function ThemeControl({ current }: { current: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const options: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <>
      <div className="seg" style={{ marginTop: 0, marginBottom: "0.875rem" }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            data-active={current === o.value}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const { error } = await setThemeAction(o.value);
                setFailed(error);
              })
            }
          >
            {o.label}
          </button>
        ))}
      </div>
      <DidNotSave message={failed} />
    </>
  );
}

function PaletteSwatch({ m }: { m: PaletteMode }) {
  return (
    <span className="kin-palette-swatch" style={{ background: m.bg }} aria-hidden="true">
      <span className="kin-palette-card" style={{ background: m.surface, borderColor: m.divider }}>
        <span className="kin-palette-line" style={{ background: m.text }} />
        <span className="kin-palette-line kin-palette-line-short" style={{ background: m.muted }} />
        <span className="kin-palette-row">
          <span className="kin-palette-pill" style={{ background: m.accent }} />
          <span className="kin-palette-dot" style={{ background: m.ink }} />
          <span className="kin-palette-dot" style={{ background: m.accent2 }} />
        </span>
      </span>
    </span>
  );
}

/** Colour themes, each shown as a small picture of itself in light and dark
 * rather than as a name, since nobody picks a theme by its name. Choosing one
 * saves it and asks whether to restart, the same as text size: the colours
 * arrive with the next load instead of repainting under the finger. */
export function PaletteControl({ current }: { current: string }) {
  const [selected, setSelected] = useState(current);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const choose = (id: string, name: string) => {
    if (id === selected) return;
    const previous = selected;
    setSelected(id);
    startTransition(async () => {
      const { error } = await setPaletteAction(id);
      setFailed(error);
      if (error) {
        setSelected(previous);
        return;
      }
      const restart = await confirm({
        title: `Restart Kin to switch to ${name}?`,
        description: "The new colours take effect when Kin reloads. Choose Later and they will apply the next time you open it.",
        confirmLabel: "Restart",
        cancelLabel: "Later",
      });
      if (restart) window.location.reload();
    });
  };

  return (
    <>
      <div className="kin-palettes" role="radiogroup" aria-label="Colour theme">
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected === p.id}
            className="kin-palette"
            disabled={pending}
            onClick={() => choose(p.id, p.name)}
          >
            <span className="kin-palette-pair">
              <PaletteSwatch m={p.light} />
              {!p.darkOnly && <PaletteSwatch m={p.dark} />}
            </span>
            <span className="kin-palette-name">{p.name}</span>
            <span className="kin-palette-blurb">{p.darkOnly ? `${p.blurb} · always dark` : p.blurb}</span>
          </button>
        ))}
      </div>
      <DidNotSave message={failed} />
    </>
  );
}

/** Text size as a range, 85% to 300%, like the interface scale in Telegram's
 * settings. The sample line under the slider shows the size as it will be,
 * before anything is saved; letting go saves it and asks whether to restart
 * now, because the whole app is laid out around the size it opened with. */
export function TextSizeControl({ current }: { current: number }) {
  const uid = useId();
  const [value, setValue] = useState(current);
  const [saved, setSaved] = useState(current);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const commit = (next: number) => {
    if (next === saved) return;
    startTransition(async () => {
      const { error } = await setTextScaleAction(next);
      setFailed(error);
      if (error) {
        setValue(saved);
        return;
      }
      setSaved(next);
      const restart = await confirm({
        title: "Restart Kin to use the new text size?",
        description: `Everything is laid out around the size Kin opened with, so ${next}% takes effect when it reloads. Choose Later and it will apply the next time you open Kin.`,
        confirmLabel: "Restart",
        cancelLabel: "Later",
      });
      if (restart) window.location.reload();
    });
  };

  // The sample is sized relative to the text around it, which is already at
  // the saved scale, so it shows the new size exactly as it will look.
  const sample = `${(value / saved).toFixed(4)}em`;

  return (
    <>
      <div className="kin-scale">
        <div className="kin-scale-head">
          <label htmlFor={`${uid}-scale`}>Text size</label>
          <output htmlFor={`${uid}-scale`} className="kin-scale-value">
            {value}%
          </output>
        </div>
        <div className="kin-scale-track">
          <span className="kin-scale-a kin-scale-a-small" aria-hidden="true">
            A
          </span>
          <input
            id={`${uid}-scale`}
            type="range"
            min={TEXT_SCALE_MIN}
            max={TEXT_SCALE_MAX}
            step={5}
            value={value}
            disabled={pending}
            onChange={(e) => setValue(Number(e.target.value))}
            // Saved when the thumb is let go, not on every step it passes
            // through -- a drag from 100 to 250 is one decision, not thirty.
            onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
            onBlur={(e) => commit(Number(e.target.value))}
            aria-valuetext={`${value} percent`}
            style={{ ["--pos" as string]: `${((value - TEXT_SCALE_MIN) / (TEXT_SCALE_MAX - TEXT_SCALE_MIN)) * 100}%` }}
          />
          <span className="kin-scale-a kin-scale-a-large" aria-hidden="true">
            A
          </span>
        </div>
        <p className="kin-scale-sample" style={{ fontSize: sample }}>
          The quick brown fox jumps over the lazy dog.
        </p>
        {value !== TEXT_SCALE_DEFAULT && (
          <button
            type="button"
            className="btn btn-ghost kin-scale-reset"
            disabled={pending}
            onClick={() => {
              setValue(TEXT_SCALE_DEFAULT);
              commit(TEXT_SCALE_DEFAULT);
            }}
          >
            Back to 100%
          </button>
        )}
      </div>
      <DidNotSave message={failed} />
    </>
  );
}

/** A preference that silently fails to save is the exact shape of the bug
 * that started all this: it reads back as though it worked. */
function DidNotSave({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", margin: "-8px 0 12px" }}>
      {message}
    </p>
  );
}

const NOTIF_DEFS = NOTIFICATION_DEFS;

export function NotificationToggles({ prefs }: { prefs: Record<string, boolean> }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <Blueprint style={{ paddingLeft: "0.9375rem" }}>
      {NOTIF_DEFS.map((n, i) => {
        const on = prefs[n.key] ?? true;
        return (
          <button
            key={n.key}
            type="button"
            role="switch"
            aria-checked={on}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const { error } = await toggleNotificationAction(n.key, !on);
                setFailed(error);
              })
            }
            style={{
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              background: "none",
              border: 0,
              // Separators start at the text, not the card edge.
              borderTop: i === 0 ? undefined : "1px solid var(--color-divider)",
              padding: "0.6875rem 0.9375rem 0.6875rem 0",
              display: "flex",
              gap: "0.875rem",
              alignItems: "center",
              minHeight: "3.5rem",
              font: "inherit",
              color: "inherit",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "1.0625rem", display: "block" }}>{n.name}</span>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{n.sub}</span>
            </span>
            <span className="kin-switch" data-on={on} />
          </button>
        );
      })}
      <DidNotSave message={failed} />
    </Blueprint>
  );
}

export function InviteCodeCard({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div>
      <CopyInviteCode code={code} />
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", marginTop: "0.5rem" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error } = await regenerateInviteCodeAction();
            setFailed(error);
          })
        }
      >
        {pending ? "Regenerating…" : "Regenerate code"}
      </button>
      <DidNotSave message={failed} />
    </div>
  );
}

export function HouseholdNameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ marginBottom: "0.875rem" }}>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input className="input" aria-label="Household name" value={value} onChange={(e) => setValue(e.target.value)} style={{ minHeight: "2.5rem" }} />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
          onClick={() =>
            startTransition(async () => {
              const result = await updateHouseholdNameAction(value);
              setError(result.error);
            })
          }
        >
          {pending ? "…" : "SAVE"}
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export function HouseholdPrefsForm({
  currency,
  dateFormat,
  weekStart,
  country,
}: {
  currency: string;
  dateFormat: string;
  weekStart: string;
  country: string | null;
}) {
  const uid = useId();
  const [c, setC] = useState(currency);
  const [d, setD] = useState(dateFormat);
  const [w, setW] = useState(weekStart);
  const [k, setK] = useState(country ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        {/* Rendered from the same lists the action validates against, so the
            two cannot drift apart -- an option added here and nowhere else
            would be refused on save, and one added there and not here would
            widen what the endpoint accepts with nothing on screen saying so. */}
        <select aria-label="Currency" className="input" value={c} onChange={(e) => setC(e.target.value)} style={{ minHeight: "2.5rem", flex: 1 }}>
          {CURRENCIES.map((cur) => (
            <option key={cur.code} value={cur.code}>
              {cur.label}
            </option>
          ))}
        </select>
        <select aria-label="Date format" className="input" value={d} onChange={(e) => setD(e.target.value)} style={{ minHeight: "2.5rem", flex: 1 }}>
          {DATE_FORMATS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select aria-label="Week start" className="input" value={w} onChange={(e) => setW(e.target.value)} style={{ minHeight: "2.5rem", flex: 1 }}>
          {WEEK_STARTS.map((ws) => (
            <option key={ws.value} value={ws.value}>
              {ws.label}
            </option>
          ))}
        </select>
      </div>
      {/* Where the household is, not where a phone currently happens to be
          -- used today to pick which App Store region GET APP falls back
          to searching. Blank stays a valid choice: nothing that reads this
          requires it. */}
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label htmlFor={`${uid}-country`}>COUNTRY</label>
        <select id={`${uid}-country`} className="input" value={k} onChange={(e) => setK(e.target.value)} style={{ minHeight: "2.5rem" }}>
          <option value="">— not set —</option>
          {COUNTRIES.map((cc) => (
            <option key={cc.code} value={cc.code}>
              {cc.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={pending}
        style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
        onClick={() =>
          startTransition(async () => {
            const result = await updateHouseholdPrefsAction(c, d, w, k);
            setError(result.error);
          })
        }
      >
        {pending ? "…" : "SAVE HOUSEHOLD PREFERENCES"}
      </button>
      {error && <p role="alert" style={{ color: "var(--color-accent-700)", fontSize: "0.8125rem", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export function DriveConnectedPanel({
  email,
  rootFolderLink,
  lastSyncedAt,
  connectedByName,
  canManage,
}: {
  email: string | null;
  rootFolderLink: string | null;
  lastSyncedAt: string | null;
  connectedByName: string | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [driveFailed, setDriveFailed] = useState<string | null>(null);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.0625rem", background: "var(--color-divider)", border: "1px solid var(--color-divider)", marginBottom: "0.75rem" }}>
        <div style={{ background: "var(--color-bg)", padding: "0.5625rem 0.6875rem" }}>
          <div style={{ fontSize: "0.6875rem", letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Account</div>
          <div style={{ fontSize: "0.875rem" }}>{email ?? "—"}</div>
        </div>
        <div style={{ background: "var(--color-bg)", padding: "0.5625rem 0.6875rem" }}>
          <div style={{ fontSize: "0.6875rem", letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Connected by</div>
          <div style={{ fontSize: "0.875rem" }}>{connectedByName ?? "—"}</div>
        </div>
      </div>
      {rootFolderLink && (
        <a
          href={rootFolderLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-block"
          style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginBottom: canManage ? 9 : 0 }}
        >
          OPEN KIN FOLDER IN DRIVE
        </a>
      )}
      {canManage && (
        <>
          <MigratePhotosButton />
          <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", margin: "9px 0" }}>
            Sharing (who can open the folder link) is set in Google Drive itself, not here — open the folder above and
            use Drive&apos;s own Share dialog.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={pending}
            style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
            onClick={() =>
              startTransition(async () => {
                const { error } = await disconnectDriveAction();
                setDriveFailed(error);
              })
            }
          >
            {pending ? "…" : "DISCONNECT"}
          </button>
          {driveFailed && (
            <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", margin: "6px 0 0" }}>
              {driveFailed}
            </p>
          )}
        </>
      )}
      {lastSyncedAt && (
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>Last synced {familyDateTime(new Date(lastSyncedAt))}</div>
      )}
    </>
  );
}

/** One-time backfill button for profile photos (member avatars, household
 * cover photo) that were uploaded to Supabase Storage before Drive was
 * connected, or before uploads started routing there. Safe to click more
 * than once — it only ever touches rows that still lack a drive_file_id. */
function MigratePhotosButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div style={{ marginBottom: "0.5625rem" }}>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={busy}
        style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const result = await migrateProfilePhotosToDriveAction();
          setBusy(false);
          setIsError(!!result.error);
          setMessage(result.error ?? (result.migrated ? `Moved ${result.migrated} photo${result.migrated === 1 ? "" : "s"} to Drive.` : "Nothing to move — already up to date."));
        }}
      >
        {busy ? "MOVING…" : "MOVE EXISTING PHOTOS TO DRIVE"}
      </button>
      {message && (
        <p role={isError ? "alert" : undefined} style={{ fontSize: "0.8125rem", color: isError ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "6px 0 0" }}>{message}</p>
      )}
    </div>
  );
}

export function CalendarConnectedPanel({ email, lastSyncedAt }: { email: string | null; lastSyncedAt: string | null }) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <>
      <div style={{ background: "var(--color-bg)", border: "1px solid var(--color-divider)", padding: "0.5625rem 0.6875rem", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.6875rem", letterSpacing: ".02em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Account</div>
        <div style={{ fontSize: "0.875rem" }}>{email ?? "—"}</div>
      </div>
      <SyncCalendarButton />
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={pending}
        style={{ minHeight: "2.5rem", fontSize: "0.84375rem", marginTop: "0.5625rem" }}
        onClick={() =>
          startTransition(async () => {
            const { error } = await disconnectCalendarAction();
            setFailed(error);
          })
        }
      >
        {pending ? "…" : "DISCONNECT"}
      </button>
      {/* A disconnect that quietly did not happen leaves the household
          believing Google is no longer reading their calendar. */}
      {failed && (
        <p role="alert" style={{ fontSize: "0.8125rem", color: "var(--color-accent-700)", margin: "6px 0 0" }}>
          {failed}
        </p>
      )}
      {lastSyncedAt && (
        <div style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)", marginTop: "0.625rem" }}>Last synced {familyDateTime(new Date(lastSyncedAt))}</div>
      )}
    </>
  );
}

/** Runs the full push+pull reconcile on demand. The Planner Calendar tab
 * also triggers this opportunistically (throttled), so this button is
 * mainly for "I just changed something in Google Calendar and want it here
 * now" rather than the only way syncing happens. */
function SyncCalendarButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={busy}
        style={{ minHeight: "2.5rem", fontSize: "0.84375rem" }}
        onClick={async () => {
          setBusy(true);
          setMessage(null);
          const result = await syncGoogleCalendarAction();
          setBusy(false);
          setIsError(!!result.error);
          setMessage(result.error ?? (result.synced ? `Synced ${result.synced} change${result.synced === 1 ? "" : "s"}.` : "Already up to date."));
        }}
      >
        {busy ? "SYNCING…" : "SYNC NOW"}
      </button>
      {message && (
        <p role={isError ? "alert" : undefined} style={{ fontSize: "0.8125rem", color: isError ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "6px 0 0" }}>{message}</p>
      )}
    </div>
  );
}

/** Apple Calendar (and Outlook, and anything else that subscribes to a link).
 * Apple offers no sign-in a web app can use, so this is a private link the
 * calendar checks every so often. It is shown once, when it is made. */
export function CalendarFeedControl({ hasLink }: { hasLink: boolean }) {
  const [links, setLinks] = useState<{ https: string; webcal: string } | null>(null);
  const [on, setOn] = useState(hasLink);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const make = async () => {
    if (on && !(await confirm({ title: "Make a new link?", description: "The old link stops working, so any calendar using it stops updating until you subscribe with the new one.", confirmLabel: "Make new link" }))) return;
    startTransition(async () => {
      const result = await createCalendarFeedAction();
      setFailed(result.error);
      if (!result.error && result.https && result.webcal) {
        setLinks({ https: result.https, webcal: result.webcal });
        setOn(true);
      }
    });
  };

  const turnOff = async () => {
    if (!(await confirm({ title: "Turn off the calendar link?", description: "Calendars subscribed to it stop updating.", confirmLabel: "Turn off", danger: true }))) return;
    startTransition(async () => {
      const { error } = await removeCalendarFeedAction();
      setFailed(error);
      if (!error) {
        setOn(false);
        setLinks(null);
      }
    });
  };

  const copy = async () => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.https);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed("Couldn't copy. Press and hold the link to copy it instead.");
    }
  };

  return (
    <div className="kin-feed">
      <p className="kin-feed-lede">
        See the family&apos;s plans in Apple Calendar or Outlook. Your tasks and the whole family&apos;s appear there and update by themselves.
      </p>
      {links ? (
        <>
          <a href={links.webcal} className="btn btn-primary btn-block">
            OPEN IN APPLE CALENDAR
          </a>
          <div className="kin-feed-link">
            <code>{links.https}</code>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="kin-feed-note">
            For Outlook or Google Calendar, add a calendar &ldquo;from URL&rdquo; and paste this. It is shown only now, and anyone with it can see these plans, so keep it to yourself.
          </p>
        </>
      ) : (
        <button type="button" className="btn btn-secondary btn-block" disabled={pending} onClick={make}>
          {pending ? "MAKING A LINK…" : on ? "MAKE A NEW LINK" : "GET MY CALENDAR LINK"}
        </button>
      )}
      {on && (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={turnOff} style={{ marginTop: "0.25rem" }}>
          Turn the link off
        </button>
      )}
      <DidNotSave message={failed} />
    </div>
  );
}
