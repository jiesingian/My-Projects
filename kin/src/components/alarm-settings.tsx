"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Blueprint } from "@/components/ui";
import { setAlarmPickAction } from "@/lib/actions/alarms";
import { ALARMS_CHANGED, inNativeApp, nativeAlarms, type AlarmStatus } from "@/lib/native";

const noSubscribe = () => () => {};

export type AlarmChoice = { kind: "activity" | "appointment" | "bill"; id: string; title: string; when: string; on: boolean };

/** Settings -> Notifications -> Alarms: which of Kin's reminders ring like
 * the Clock app in the Kin iPhone app (lib/alarms.ts). In a browser the
 * choices are kept, and say they ring once the app is installed. */
export function AlarmSettings({ dosesOn, plans, checkups, bills }: { dosesOn: boolean; plans: AlarmChoice[]; checkups: AlarmChoice[]; bills: AlarmChoice[] }) {
  // Known only in the page; the server renders the browser's words.
  const native = useSyncExternalStore(noSubscribe, inNativeApp, () => false);
  const [status, setStatus] = useState<AlarmStatus | null>(null);
  useEffect(() => {
    const read = () => void nativeAlarms()?.status().then(setStatus, () => setStatus(null));
    read();
    // Back from the phone's Settings (Android: Alarms & reminders, full
    // screen), the switch may have changed.
    const onShow = () => document.visibilityState === "visible" && read();
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, []);

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--color-neutral-700)" }}>
        {native
          ? "These ring like the Clock app: full screen, with sound even when the phone is on silent, until you stop them."
          : "In the Kin iPhone app these ring like the Clock app: full screen, with sound even on silent. Your choices here are kept for when it's installed."}
      </p>
      {native && status && <Permission status={status} onChange={setStatus} />}

      <section aria-labelledby="alarms-doses">
        <h2 id="alarms-doses" className="kin-eyebrow" style={{ margin: "0 0 0.5rem" }}>
          MEDICINE DOSES
        </h2>
        <Blueprint style={{ padding: "0.875rem 0.9375rem" }}>
          <span style={{ fontSize: "1.0625rem", display: "block" }}>{dosesOn ? "Every dose rings at its time" : "Doses don't ring"}</span>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>
            {dosesOn
              ? "Your own medicines, and a child's medicines shared with you, until Taken. "
              : "Health reminders is off. "}
            <Link href="/settings/notifications">Health reminders</Link> switches these on and off.
          </span>
        </Blueprint>
      </section>

      <Group id="alarms-plans" heading="PLANS" lead="30 minutes before it starts" items={plans} empty="No plans in the next two weeks." />
      <Group id="alarms-checkups" heading="CHECK-UPS" lead="An hour before" items={checkups} empty="No check-ups booked in the next two weeks." />
      <Group id="alarms-bills" heading="BILLS" lead="At 9:00 on the day it's due" items={bills} empty="No bills due in the next two weeks." />
    </div>
  );
}

function Permission({ status, onChange }: { status: AlarmStatus; onChange: (s: AlarmStatus) => void }) {
  // On Android, authorize() opens the one settings page still needed
  // (notifications, then Alarms & reminders, then full screen).
  const ask = (label: string) => (
    <button type="button" className="btn btn-primary" onClick={() => void nativeAlarms()?.authorize().then(onChange)}>
      {label}
    </button>
  );
  if (status.authorization === "authorized")
    return (
      <>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>
          {status.engine === "alarmkit"
            ? `Alarms are on. ${status.scheduled} set on this iPhone.`
            : status.engine === "android"
              ? `Alarms are on. ${status.scheduled} set on this phone.`
              : `This iPhone is older than iOS 26, so these come as urgent notifications. ${status.scheduled} set.`}
        </p>
        {status.engine === "android" && status.fullScreen === false && (
          <>
            <p role="alert" style={{ margin: 0, fontWeight: 600 }}>
              They ring as a notification, not full screen over the lock screen, until Kin may use the full screen.
            </p>
            {ask("Allow full screen")}
          </>
        )}
      </>
    );
  if (status.authorization === "denied")
    return status.engine === "android" ? (
      <>
        <p role="alert" style={{ margin: 0, fontWeight: 600 }}>
          Alarms are turned off for Kin. Allow its notifications, and Alarms & reminders, in the phone’s Settings.
        </p>
        {ask("Open Settings")}
      </>
    ) : (
      <p role="alert" style={{ margin: 0, fontWeight: 600 }}>
        Alarms are turned off for Kin. Turn them on in the iPhone’s Settings → Apps → Kin.
      </p>
    );
  return ask("Allow Kin to set alarms");
}

function Group({ id, heading, lead, items, empty }: { id: string; heading: string; lead: string; items: AlarmChoice[]; empty: string }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="kin-eyebrow" style={{ margin: "0 0 0.25rem" }}>
        {heading}
      </h2>
      <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>Rings {lead.charAt(0).toLowerCase() + lead.slice(1)}.</p>
      {items.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-neutral-600)" }}>{empty}</p>
      ) : (
        <Blueprint style={{ paddingLeft: "0.9375rem" }}>
          {items.map((it, i) => (
            <Choice key={`${it.kind}:${it.id}`} item={it} first={i === 0} />
          ))}
        </Blueprint>
      )}
    </section>
  );
}

function Choice({ item, first }: { item: AlarmChoice; first: boolean }) {
  const [on, setOn] = useState(item.on);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div style={{ borderTop: first ? undefined : "1px solid var(--color-divider)" }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Ring as an alarm: ${item.title}, ${item.when}`}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          start(async () => {
            const { error } = await setAlarmPickAction(item.kind, item.id, next);
            setFailed(error);
            if (error) setOn(!next);
            else window.dispatchEvent(new Event(ALARMS_CHANGED));
          });
        }}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          background: "none",
          border: 0,
          padding: "0.6875rem 0.9375rem 0.6875rem 0",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.375rem 0.875rem",
          alignItems: "center",
          minHeight: "3.5rem",
          font: "inherit",
          color: "inherit",
        }}
      >
        <span style={{ flex: "1 1 9rem", minWidth: 0 }}>
          <span style={{ fontSize: "1.0625rem", display: "block", overflowWrap: "anywhere" }}>{item.title}</span>
          <span style={{ fontSize: "0.8125rem", color: "var(--color-neutral-600)" }}>{item.when}</span>
        </span>
        <span className="kin-switch" data-on={on} />
      </button>
      {failed && (
        <p role="alert" style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", fontWeight: 600 }}>
          {failed}
        </p>
      )}
    </div>
  );
}
