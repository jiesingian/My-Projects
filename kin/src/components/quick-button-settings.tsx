"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { Icon, type IconName } from "@/components/icons";
import { createBriefLinkAction, previewBriefAction, removeBriefLinkAction, setQuickButtonAction } from "@/lib/actions/settings";
import { speak, speechOutSupported, stopSpeaking } from "@/lib/speech";
import { MENU_MAX, QUICK_ACTIONS, WIDGET_MAX, quickAction, type QuickActionId, type QuickPrefs } from "@/lib/quick-button";

const noSubscribe = () => () => {};

const ICONS: Record<QuickActionId, IconName> = {
  open: "house",
  ask: "sparkle",
  talk: "mic",
  "family-chat": "message",
  buy: "basket",
  expense: "receipt",
  event: "calendarDays",
  journal: "images",
};

/** Settings → Action Button & widget: what the Action Button's pop-up and the
 * Home Screen widget offer, a picture of each, and the one-time setup. */
export function QuickButtonSettings({ initial, briefOn }: { initial: QuickPrefs; briefOn: boolean }) {
  const [prefs, setPrefs] = useState<QuickPrefs>(initial);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  // The links are shown whole, because that is what gets pasted into
  // Shortcuts; the origin is only known in the browser.
  const origin = useSyncExternalStore(noSubscribe, () => window.location.origin, () => "");

  function toggle(list: "menu" | "widget", id: QuickActionId) {
    const max = list === "menu" ? MENU_MAX : WIDGET_MAX;
    const has = prefs[list].includes(id);
    if (has && prefs[list].length === 1) return setFailed("Keep at least one.");
    if (!has && prefs[list].length >= max) return setFailed(`That's the most it holds (${max}).`);
    const nextList = QUICK_ACTIONS.map((a) => a.id).filter((a) => (a === id ? !has : prefs[list].includes(a)));
    const next = { ...prefs, [list]: nextList };
    const previous = prefs;
    setPrefs(next);
    setFailed(null);
    startTransition(async () => {
      const { error } = await setQuickButtonAction(next);
      setFailed(error);
      if (error) setPrefs(previous);
    });
  }

  return (
    <div className="kin-quickbtn">
      <TodayBrief initialOn={briefOn} origin={origin} />

      <section className="kin-quickbtn-section" aria-labelledby="qb-menu">
        <h2 id="qb-menu" className="kin-quickbtn-h">Action Button</h2>
        <p className="kin-quickbtn-lead">Press the Action Button and a small menu pops up. Pick what&rsquo;s in it.</p>
        <MenuPreview ids={prefs.menu} />
        <Picker list="menu" picked={prefs.menu} pending={pending} onToggle={toggle} />
      </section>

      <section className="kin-quickbtn-section" aria-labelledby="qb-widget">
        <h2 id="qb-widget" className="kin-quickbtn-h">Home Screen widget</h2>
        <p className="kin-quickbtn-lead">Kin buttons on your Home Screen, one tap each. Four fit the medium size, eight the large.</p>
        <WidgetPreview ids={prefs.widget} />
        <Picker list="widget" picked={prefs.widget} pending={pending} onToggle={toggle} />
      </section>

      {failed && (
        <p role="alert" className="kin-quickbtn-error">
          {failed}
        </p>
      )}

      <section className="kin-quickbtn-section" aria-labelledby="qb-setup">
        <h2 id="qb-setup" className="kin-quickbtn-h">Set it up once</h2>
        <p className="kin-quickbtn-lead">About five minutes. Tick each step as you go; Kin remembers where you got to on this phone.</p>
        <SetupGuide prefs={prefs} origin={origin} />
      </section>

      <details className="kin-quickbtn-more">
        <summary>Why the volume and side buttons can&rsquo;t be used</summary>
        <p>
          Apple keeps the volume buttons for volume and the side button for Siri, and doesn&rsquo;t let any app change them. You can still reach Kin from the side button: hold
          it and say the name of a widget button, such as &ldquo;Talk to Kin&rdquo;.
        </p>
      </details>
    </div>
  );
}

function Picker({
  list,
  picked,
  pending,
  onToggle,
}: {
  list: "menu" | "widget";
  picked: QuickActionId[];
  pending: boolean;
  onToggle: (list: "menu" | "widget", id: QuickActionId) => void;
}) {
  return (
    <div className="kin-quickbtn-picker" role="group" aria-label={list === "menu" ? "In the pop-up" : "On the widget"}>
      {QUICK_ACTIONS.map((a) => {
        const on = picked.includes(a.id);
        return (
          <button key={a.id} type="button" aria-pressed={on} disabled={pending} className="kin-quickbtn-chip" onClick={() => onToggle(list, a.id)}>
            <Icon name={on ? "check" : ICONS[a.id]} size={15} />
            {a.name}
          </button>
        );
      })}
    </div>
  );
}

/** What the Action Button shows: the Shortcuts menu, drawn as iOS draws it. */
function MenuPreview({ ids }: { ids: QuickActionId[] }) {
  return (
    <div className="kin-qb-phone" aria-hidden="true">
      <div className="kin-qb-menu">
        <div className="kin-qb-menu-title">Kin</div>
        {ids.map((id) => (
          <div key={id} className="kin-qb-menu-row">
            {quickAction(id).name}
          </div>
        ))}
        <div className="kin-qb-menu-row kin-qb-menu-cancel">Cancel</div>
      </div>
    </div>
  );
}

/** What the widget looks like on the Home Screen. */
function WidgetPreview({ ids }: { ids: QuickActionId[] }) {
  return (
    <div className="kin-qb-widget" data-large={ids.length > 4 || undefined} aria-hidden="true">
      {ids.map((id) => (
        <div key={id} className="kin-qb-widget-btn">
          <Icon name={ICONS[id]} size={16} />
          <span>{quickAction(id).name}</span>
        </div>
      ))}
    </div>
  );
}

const DONE_KEY = "kin-quickbtn-done";

function readDone(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function SetupGuide({ prefs, origin }: { prefs: QuickPrefs; origin: string }) {
  const [done, setDone] = useState<string[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
  useEffect(() => setDone(readDone()), []);

  function tick(key: string) {
    const next = done.includes(key) ? done.filter((k) => k !== key) : [...done, key];
    setDone(next);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(next));
    } catch {
      /* private mode: the ticks just do not persist */
    }
  }

  const menuNames = prefs.menu.map((id) => quickAction(id).name);
  const steps: { key: string; title: string; body: React.ReactNode }[] = [
    {
      key: "safari",
      title: "Sign in to Kin in Safari",
      body: (
        <p>
          Shortcuts open Kin in Safari, not from the Home Screen icon, and Safari keeps its own sign-in. Open <b>{origin || "Kin"}</b> in Safari and sign in once.
        </p>
      ),
    },
    {
      key: "menu",
      title: "Make the “Kin” pop-up",
      body: (
        <>
          <ol className="kin-quickbtn-sub">
            <li>
              In Shortcuts, tap <b>+</b> and name the shortcut <b>Kin</b>.
            </li>
            <li>
              Add the action <b>Choose from Menu</b>, set its prompt to <b>Kin</b>, and give it {menuNames.length} item{menuNames.length === 1 ? "" : "s"}: {menuNames.map((n, i) => (
                <span key={n}>
                  <b>{n}</b>
                  {i < menuNames.length - 1 ? ", " : ""}
                </span>
              ))}
              .
            </li>
            <li>
              Under each item, add <b>Open URLs</b> with its link:
            </li>
          </ol>
          {prefs.menu.map((id) => (
            <CopyLink key={id} label={quickAction(id).name} url={`${origin}/go/${id}`} />
          ))}
          <OpenShortcuts />
        </>
      ),
    },
    {
      key: "action",
      title: "Put it on the Action Button",
      body: (
        <p>
          iPhone <b>Settings → Action Button</b>, swipe to <b>Shortcut</b>, tap <b>Choose a Shortcut</b> and pick <b>Kin</b>. Press the button: the menu pops up.
        </p>
      ),
    },
    {
      key: "widget-shortcuts",
      title: "Make one shortcut per widget button",
      body: (
        <>
          <p>
            For each one: in Shortcuts tap <b>+</b>, add <b>Open URLs</b> with the link, and name it as shown. Tap the icon at the top to give it Kin&rsquo;s coral colour.
          </p>
          {prefs.widget.map((id) => (
            <CopyLink key={id} label={quickAction(id).name} url={`${origin}/go/${id}`} />
          ))}
          <p>
            Then put them in one folder: in the Shortcuts list, touch and hold each → <b>Move</b> → <b>New Folder</b> called <b>Kin</b>.
          </p>
          <OpenShortcuts />
        </>
      ),
    },
    {
      key: "widget",
      title: "Add the widget to your Home Screen",
      body: (
        <p>
          Touch and hold an empty spot on the Home Screen → <b>Edit</b> → <b>Add Widget</b> → <b>Shortcuts</b> → pick the {prefs.widget.length > 4 ? "large" : "medium"} size →{" "}
          <b>Add Widget</b>. Then touch and hold the widget → <b>Edit Widget</b> → <b>Folder</b> → <b>Kin</b>.
        </p>
      ),
    },
  ];

  const finished = steps.every((s) => done.includes(s.key));

  return (
    <>
      {finished && (
        <p className="kin-quickbtn-done">
          <Icon name="check" size={16} /> All set. The pop-up and widget follow the lists above; if you add something new, make its shortcut too.
        </p>
      )}
      <ol className="kin-quickbtn-guide">
        {steps.map((s, i) => {
          const isDone = done.includes(s.key);
          return (
            <li key={s.key} className="kin-quickbtn-step" data-done={isDone || undefined}>
              <div className="kin-quickbtn-step-head">
                <span className="kin-quickbtn-step-n">{isDone ? <Icon name="check" size={14} /> : i + 1}</span>
                <span className="kin-quickbtn-step-title">{s.title}</span>
              </div>
              <div className="kin-quickbtn-step-body">{s.body}</div>
              <button type="button" className="btn btn-secondary kin-quickbtn-tick" aria-pressed={isDone} onClick={() => tick(s.key)}>
                {isDone ? "Done ✓" : "Mark as done"}
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function OpenShortcuts() {
  return (
    <a className="btn btn-primary kin-quickbtn-open" href="shortcuts://create-shortcut">
      <Icon name="external" size={15} /> Open Shortcuts
    </a>
  );
}

function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="kin-quickbtn-shortcut">
      <div className="kin-quickbtn-shortcut-name">{label}</div>
      <div className="kin-quickbtn-link">
        <code>{url}</code>
        <button
          type="button"
          className="btn btn-secondary"
          aria-label={`Copy the link for ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              window.prompt("Copy this link", url);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** "Today in Kin": one tap and the iPhone reads today's plan aloud, with
 * times. A Shortcut fetches the member's private link (Get Contents of URL)
 * and speaks it (Speak Text) in the phone's own voice -- free, and it works
 * without the AI key. */
function TodayBrief({ initialOn, origin }: { initialOn: boolean; origin: string }) {
  const [on, setOn] = useState(initialOn);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const canSpeak = useSyncExternalStore(noSubscribe, speechOutSupported, () => false);

  function make() {
    startTransition(async () => {
      const r = await createBriefLinkAction();
      setFailed(r.error);
      if (r.url) {
        setUrl(r.url);
        setOn(true);
      }
    });
  }

  function hear() {
    startTransition(async () => {
      const { text } = await previewBriefAction();
      setPreview(text);
      if (canSpeak) {
        stopSpeaking();
        speak(text);
      }
    });
  }

  return (
    <section className="kin-quickbtn-section" aria-labelledby="qb-brief">
      <h2 id="qb-brief" className="kin-quickbtn-h">Today in Kin, read aloud</h2>
      <p className="kin-quickbtn-lead">
        One tap and your iPhone says what&rsquo;s on today, with the times. It uses the phone&rsquo;s own voice, so it&rsquo;s free and works without Kin AI.
      </p>
      <div className="kin-quickbtn-row">
        <button type="button" className="btn btn-secondary" onClick={hear} disabled={pending}>
          <Icon name="play" size={15} /> Hear today&rsquo;s plan
        </button>
      </div>
      {preview && <p className="kin-quickbtn-preview">{preview}</p>}

      {url ? (
        <>
          <p className="kin-quickbtn-lead">
            <b>Your private link.</b> Copy it now: Kin shows it only once. Anyone with it can hear your day, so keep it in the Shortcut and nowhere else.
          </p>
          <CopyLink label="Today in Kin" url={url} />
        </>
      ) : (
        <div className="kin-quickbtn-row">
          <button type="button" className="btn btn-primary" onClick={make} disabled={pending}>
            {on ? "Make a new link" : "Make my link"}
          </button>
          {on && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await removeBriefLinkAction();
                  setFailed(r.error);
                  if (!r.error) setOn(false);
                })
              }
            >
              Turn it off
            </button>
          )}
        </div>
      )}
      {on && !url && <p className="kin-quickbtn-note">Your link is on. A new link replaces it, and the old one stops working.</p>}
      {failed && (
        <p role="alert" className="kin-quickbtn-error">
          {failed}
        </p>
      )}

      <ol className="kin-quickbtn-sub kin-quickbtn-brief-steps">
        <li>
          In Shortcuts, tap <b>+</b>, add <b>Get Contents of URL</b> and paste your link.
        </li>
        <li>
          Add <b>Speak Text</b> under it. Name the shortcut <b>Today in Kin</b>.
        </li>
        <li>
          <b>Widget:</b> move it into your <b>Kin</b> folder, and it&rsquo;s one tap on the Home Screen.
        </li>
        <li>
          <b>Action Button:</b> in the <b>Kin</b> shortcut&rsquo;s menu add an item <b>Today in Kin</b>, with the action <b>Run Shortcut → Today in Kin</b>.
        </li>
        <li>
          <b>Hands-free:</b> say &ldquo;Hey Siri, Today in Kin&rdquo;.
        </li>
      </ol>
      {origin && <OpenShortcuts />}
    </section>
  );
}
