"use client";

import { useTransition } from "react";
import { setThemeAction, setTextSizeAction, toggleNotificationAction, updateHouseholdNameAction, updateHouseholdPrefsAction } from "@/lib/actions/settings";
import { regenerateInviteCodeAction } from "@/lib/actions/family";
import { disconnectDriveAction } from "@/lib/actions/drive";
import { migrateProfilePhotosToDriveAction } from "@/lib/actions/photo-migration";
import { useState } from "react";
import { CopyInviteCode } from "@/components/copy-invite-code";

export function ThemeControl({ current }: { current: string }) {
  const [pending, startTransition] = useTransition();
  const options: { value: "light" | "dark" | "system"; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
  ];
  return (
    <div className="seg" style={{ marginTop: 0, marginBottom: 14 }}>
      {options.map((o) => (
        <button key={o.value} type="button" data-active={current === o.value} disabled={pending} onClick={() => startTransition(() => setThemeAction(o.value))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextSizeControl({ current }: { current: string }) {
  const [pending, startTransition] = useTransition();
  const options: { value: "small" | "default" | "large"; label: string }[] = [
    { value: "small", label: "Small" },
    { value: "default", label: "Default" },
    { value: "large", label: "Large" },
  ];
  return (
    <div className="seg" style={{ marginTop: 0, marginBottom: 22 }}>
      {options.map((o) => (
        <button key={o.value} type="button" data-active={current === o.value} disabled={pending} onClick={() => startTransition(() => setTextSizeAction(o.value))}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const NOTIF_DEFS: { key: string; name: string; sub: string }[] = [
  { key: "events", name: "Events and schedules", sub: "Day before, and one hour ahead" },
  { key: "health", name: "Health reminders", sub: "Vaccinations, check-ups, medication" },
  { key: "bills", name: "Bills and utilities", sub: "Three days before due date" },
  { key: "journal", name: "Journal activity", sub: "When someone adds photos or a note" },
  { key: "shopping", name: "Shopping list", sub: "When an item is added by another member" },
];

export function NotificationToggles({ prefs }: { prefs: Record<string, boolean> }) {
  const [pending, startTransition] = useTransition();
  return (
    <>
      {NOTIF_DEFS.map((n) => {
        const on = prefs[n.key] ?? true;
        return (
          <button
            key={n.key}
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => toggleNotificationAction(n.key, !on))}
            style={{
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              background: "none",
              border: 0,
              borderBottom: "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)",
              padding: "12px 0",
              display: "flex",
              gap: 12,
              alignItems: "center",
              font: "inherit",
              color: "inherit",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, display: "block" }}>{n.name}</span>
              <span style={{ fontSize: 11, color: "var(--color-neutral-600)" }}>{n.sub}</span>
            </span>
            <span
              style={{
                width: 38,
                height: 21,
                flex: "none",
                border: `1px solid ${on ? "var(--color-accent)" : "var(--color-divider)"}`,
                background: on ? "var(--color-accent)" : "transparent",
                display: "flex",
                alignItems: "center",
                padding: 2,
                justifyContent: on ? "flex-end" : "flex-start",
              }}
            >
              <span style={{ width: 15, height: 15, background: on ? "var(--color-bg)" : "var(--color-neutral-500)", display: "block" }} />
            </span>
          </button>
        );
      })}
    </>
  );
}

export function InviteCodeCard({ code }: { code: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <CopyInviteCode code={code} />
      <button
        type="button"
        className="btn btn-ghost"
        style={{ fontSize: 11.5, marginTop: 8 }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await regenerateInviteCodeAction();
          })
        }
      >
        {pending ? "Regenerating…" : "Regenerate code"}
      </button>
    </div>
  );
}

export function HouseholdNameForm({ familyId, name }: { familyId: string; name: string }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} style={{ minHeight: 40 }} />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          style={{ minHeight: 40, fontSize: 12 }}
          onClick={() =>
            startTransition(async () => {
              const result = await updateHouseholdNameAction(familyId, value);
              setError(result.error);
            })
          }
        >
          {pending ? "…" : "SAVE"}
        </button>
      </div>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}

export function HouseholdPrefsForm({
  familyId,
  currency,
  dateFormat,
  weekStart,
}: {
  familyId: string;
  currency: string;
  dateFormat: string;
  weekStart: string;
}) {
  const [c, setC] = useState(currency);
  const [d, setD] = useState(dateFormat);
  const [w, setW] = useState(weekStart);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <select className="input" value={c} onChange={(e) => setC(e.target.value)} style={{ minHeight: 40 }}>
          <option value="PHP">PHP ₱</option>
          <option value="USD">USD $</option>
          <option value="EUR">EUR €</option>
        </select>
        <select className="input" value={d} onChange={(e) => setD(e.target.value)} style={{ minHeight: 40 }}>
          <option value="DD/MM/YYYY">DD/MM/YYYY</option>
          <option value="MM/DD/YYYY">MM/DD/YYYY</option>
        </select>
        <select className="input" value={w} onChange={(e) => setW(e.target.value)} style={{ minHeight: 40 }}>
          <option value="monday">Mon start</option>
          <option value="sunday">Sun start</option>
        </select>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={pending}
        style={{ minHeight: 40, fontSize: 12 }}
        onClick={() =>
          startTransition(async () => {
            const result = await updateHouseholdPrefsAction(familyId, c, d, w);
            setError(result.error);
          })
        }
      >
        {pending ? "…" : "SAVE HOUSEHOLD PREFERENCES"}
      </button>
      {error && <p style={{ color: "var(--color-accent-700)", fontSize: 11.5, margin: "6px 0 0" }}>{error}</p>}
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
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--color-divider)", border: "1px solid var(--color-divider)", marginBottom: 12 }}>
        <div style={{ background: "var(--color-bg)", padding: "9px 11px" }}>
          <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Account</div>
          <div style={{ fontSize: 12.5 }}>{email ?? "—"}</div>
        </div>
        <div style={{ background: "var(--color-bg)", padding: "9px 11px" }}>
          <div style={{ fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--color-neutral-600)" }}>Connected by</div>
          <div style={{ fontSize: 12.5 }}>{connectedByName ?? "—"}</div>
        </div>
      </div>
      {rootFolderLink && (
        <a
          href={rootFolderLink}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-block"
          style={{ minHeight: 40, fontSize: 12, marginBottom: canManage ? 9 : 0 }}
        >
          OPEN KIN FOLDER IN DRIVE
        </a>
      )}
      {canManage && (
        <>
          <MigratePhotosButton />
          <p style={{ fontSize: 11, color: "var(--color-neutral-600)", margin: "9px 0" }}>
            Sharing (who can open the folder link) is set in Google Drive itself, not here — open the folder above and
            use Drive&apos;s own Share dialog.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-block"
            disabled={pending}
            style={{ minHeight: 40, fontSize: 12 }}
            onClick={() => startTransition(() => disconnectDriveAction())}
          >
            {pending ? "…" : "DISCONNECT"}
          </button>
        </>
      )}
      {lastSyncedAt && (
        <div style={{ fontSize: 11, color: "var(--color-neutral-600)", marginTop: 10 }}>Last synced {new Date(lastSyncedAt).toLocaleString()}</div>
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
    <div style={{ marginBottom: 9 }}>
      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={busy}
        style={{ minHeight: 40, fontSize: 12 }}
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
        <p style={{ fontSize: 11, color: isError ? "var(--color-accent-700)" : "var(--color-neutral-600)", margin: "6px 0 0" }}>{message}</p>
      )}
    </div>
  );
}
