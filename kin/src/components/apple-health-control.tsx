"use client";

import { useState, useTransition } from "react";
import { confirm } from "@/components/confirm-sheet";
import { createAppleHealthLinkAction, removeAppleHealthLinkAction } from "@/lib/actions/apple-health";
import { visibilityOptions } from "@/lib/visibility";

/** Settings, Connected apps, Apple Health: make the link an iPhone Shortcut
 * sends the day's readings to, and say exactly how to build that Shortcut.
 * A web app can't read Apple Health itself; see api/health/apple. */
/** `lastReceived` arrives already worded by the server, in the family's own
 * time zone: formatting it here would come out differently on the server
 * and in the browser, and React would throw the page away over it. */
export function AppleHealthControl({ connected, lastReceived, visibility: initialVisibility, role }: { connected: boolean; lastReceived: string | null; visibility: string | null; role: string }) {
  const [on, setOn] = useState(connected);
  const [url, setUrl] = useState<string | null>(null);
  const [visibility, setVisibility] = useState(initialVisibility ?? "family");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const make = async () => {
    if (on && !(await confirm({ title: "Make a new link?", description: "The old link stops working, so the Shortcut needs the new one pasted in before its next run.", confirmLabel: "Make new link" }))) return;
    startTransition(async () => {
      const result = await createAppleHealthLinkAction(visibility);
      setFailed(result.error);
      if (!result.error && result.url) {
        setUrl(result.url);
        setOn(true);
      }
    });
  };

  const turnOff = async () => {
    if (!(await confirm({ title: "Stop receiving Apple Health?", description: "The Shortcut's link stops working. Readings already in Kin stay.", confirmLabel: "Turn off", danger: true }))) return;
    startTransition(async () => {
      const { error } = await removeAppleHealthLinkAction();
      setFailed(error);
      if (!error) {
        setOn(false);
        setUrl(null);
      }
    });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFailed("Couldn't copy. Press and hold the link to copy it instead.");
    }
  };

  return (
    <div className="kin-feed">
      <p className="kin-feed-lede">
        Your steps, weight, resting heart rate and sleep from the iPhone&apos;s Health app, in your Health page in Kin. An iPhone Shortcut sends them each evening; Kin
        can&apos;t read Apple Health by itself.
      </p>
      {on && !url && <p className="kin-feed-note">{lastReceived ? `Last received ${lastReceived}.` : "Link made. Nothing received yet: run the Shortcut once to check."}</p>}

      <label className="kin-feed-note" style={{ display: "grid", gap: "0.25rem", marginBottom: "0.625rem" }}>
        Who can see the readings
        <select className="input" value={visibility} onChange={(e) => setVisibility(e.target.value)} disabled={pending} style={{ minHeight: "2.5rem" }}>
          {visibilityOptions(role).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {url && (
        <>
          <div className="kin-feed-link">
            <code>{url}</code>
            <button type="button" className="btn btn-secondary" onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="kin-feed-note">Shown only now. Anyone with it can add readings to your record, so keep it to yourself; if it gets out, make a new one.</p>
          <ShortcutSteps />
        </>
      )}

      <button type="button" className={`btn ${on ? "btn-secondary" : "btn-primary"} btn-block`} onClick={make} disabled={pending} style={{ minHeight: "2.75rem" }}>
        {pending ? "Working…" : on ? "Make a new link" : "Connect Apple Health"}
      </button>
      {on && (
        <button type="button" className="btn btn-ghost btn-block" onClick={turnOff} disabled={pending}>
          Turn off
        </button>
      )}
      {failed && <p className="kin-feed-note" style={{ color: "var(--color-accent-700)" }}>{failed}</p>}
    </div>
  );
}

/** Written against the Shortcuts app on iOS 17 and 18. Each step names the
 * action exactly as it is labelled in the app's search box. */
function ShortcutSteps() {
  return (
    <details className="kin-fold" open style={{ margin: "0.75rem 0" }}>
      <summary>Set up the Shortcut on your iPhone (about 5 minutes, once)</summary>
      <ol className="kin-steps">
        <li>
          Open the <b>Shortcuts</b> app, tap <b>+</b>, and name the new shortcut <b>Send to Kin</b>.
        </li>
        <li>
          <b>Steps.</b> Add <b>Find Health Samples</b>: Type <b>Steps</b>, Start Date <b>is today</b>. Then add <b>Calculate Statistics</b>: <b>Sum</b>.
        </li>
        <li>
          <b>Weight.</b> Add <b>Find Health Samples</b>: Type <b>Weight</b>, Sort by <b>Start Date</b>, Order <b>Latest First</b>, Limit <b>1</b>.
        </li>
        <li>
          <b>Heart rate.</b> Add <b>Find Health Samples</b>: Type <b>Resting Heart Rate</b>, Sort by <b>Start Date</b>, <b>Latest First</b>, Limit <b>1</b>.
        </li>
        <li>
          <b>Sleep (optional).</b> Add <b>Find Health Samples</b>: Type <b>Sleep Analysis</b>, Start Date <b>is in the last 1 days</b>. Add <b>Get Details of Health Samples</b>: <b>Duration</b>. Add{" "}
          <b>Calculate Statistics</b>: <b>Sum</b>.
        </li>
        <li>
          Add <b>Get Contents of URL</b> and paste your Kin link. Tap <b>Show More</b>: Method <b>POST</b>, Request Body <b>JSON</b>. Add a field for each reading: <b>steps</b>,{" "}
          <b>weight</b>, <b>heart_rate</b>, <b>sleep</b>, and for each value choose the matching result from the steps above (Statistics, or Health Samples).
        </li>
        <li>
          Tap <b>Run</b> once. Allow access to Health when asked. Come back here: it should say when Kin last received your readings.
        </li>
        <li>
          Make it daily: <b>Automation</b> tab, <b>+</b>, <b>Time of Day</b>, <b>11:00 PM</b>, <b>Daily</b>, <b>Run Immediately</b>, then choose <b>Send to Kin</b>.
        </li>
      </ol>
    </details>
  );
}
