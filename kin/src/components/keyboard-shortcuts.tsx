"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatedSheet } from "@/components/animated-sheet";
import { hotkeyFor, lettersOn, shortcutList, stepIndex, LETTERS_KEY, OVERLAY_SELECTOR, type HotkeyAction } from "@/lib/hotkeys";

/** Kin's keyboard shortcuts on a computer. lib/hotkeys.ts decides what a key
 * means; this listens on the window and acts. Nothing renders but the help
 * sheet (? or Ctrl/⌘+/), which lists them and has the switch for the
 * single-key ones. */

const OWN_ARROWS = '[role="tablist"],[role="listbox"],[role="menu"],[role="menubar"],[role="radiogroup"],[role="slider"],[role="grid"],[role="tree"],[role="spinbutton"],video,audio';
const FOCUSABLE = 'a[href],button:not([disabled]),[tabindex="0"]';

function typingIn(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  return t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT";
}

/** A sheet (Vaul over Radix's dialog), a native dialog, or anything else
 * marked modal: lib/hotkeys.ts, OVERLAY_SELECTOR, says what counts. */
function overlayOpen(): boolean {
  return !!document.querySelector(OVERLAY_SELECTOR);
}

export function KeyboardShortcuts({ simple, places, ask }: { simple: boolean; places: string[]; ask: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [help, setHelp] = useState(false);
  const [letters, setLetters] = useState(!simple);
  const pendingG = useRef<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LETTERS_KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setLetters(lettersOn(saved, simple));
  }, [simple]);

  const canAsk = ask && !pathname.startsWith("/chat");

  useEffect(() => {
    const act = (a: HotkeyAction, e: KeyboardEvent): boolean => {
      switch (a.kind) {
        case "pending":
          pendingG.current = Date.now();
          return true;
        case "search":
          // No Ask Kin in a child's view, nor on Chat (assistant-fab.tsx):
          // leave the key to the browser.
          if (!canAsk) return false;
          window.dispatchEvent(new CustomEvent("kin:ask"));
          return true;
        case "help":
          setHelp(true);
          return true;
        case "go":
          if (pathname !== a.href) router.push(a.href);
          return true;
        case "quickAdd": {
          // Today's one-line add when it is on the page; the full form elsewhere.
          const line = document.querySelector<HTMLInputElement>(".kin-quickline-input");
          if (line) {
            line.closest("details")?.setAttribute("open", "");
            line.focus();
          } else router.push("/planner/new", { scroll: false });
          return true;
        }
        case "step":
          return step(a.dir, a.axis, e.target);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const waiting = pendingG.current;
      const target = e.target instanceof Element ? e.target : null;
      const a = hotkeyFor(e, {
        typing: typingIn(e.target),
        overlay: overlayOpen(),
        ownArrows: !!target?.closest(OWN_ARROWS),
        letters,
        pendingG: waiting,
        now: Date.now(),
        places,
      });
      if (a?.kind !== "pending" && !["Shift", "Control", "Meta", "Alt"].includes(e.key)) pendingG.current = null;
      if (a && act(a, e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [letters, places, pathname, router, canAsk]);

  const setLettersSaved = (on: boolean) => {
    setLetters(on);
    try {
      localStorage.setItem(LETTERS_KEY, on ? "on" : "off");
    } catch {}
  };

  return (
    <AnimatedSheet open={help} onClose={() => setHelp(false)} labelledBy={titleId} panelClassName="sheet-panel--plain">
      <div style={{ padding: "1.25rem 1.25rem 1.5rem" }}>
        <h2 id={titleId} style={{ font: "600 1.1875rem/1.2 var(--font-heading)", margin: "0 0 0.75rem" }}>
          Keyboard shortcuts
        </h2>
        <dl className="kin-keys">
          {shortcutList(places, letters, canAsk).map((s) => (
            <div key={s.keys} className="kin-keys-row">
              <dt>
                <kbd>{s.keys}</kbd>
              </dt>
              <dd>{s.what}</dd>
            </div>
          ))}
        </dl>
        <label className="kin-keys-switch">
          <input type="checkbox" checked={letters} onChange={(e) => setLettersSaved(e.target.checked)} />
          <span>
            Single-key shortcuts
            <small>
              {simple ? "Off at first in Simple Kin. " : ""}Turn off if keys fire by accident. Saved on this computer only.
            </small>
          </span>
        </label>
      </div>
    </AnimatedSheet>
  );
}

/** Arrows: inside a list marked data-kin-arrows, move focus to the next or
 * previous item; with nothing focused in the Planner, left and right go to
 * the previous or next day. Anything else keeps its usual meaning (the
 * page scrolls), so this returns false and the key is not taken. */
function step(dir: -1 | 1, axis: "x" | "y", target: EventTarget | null): boolean {
  const from = target instanceof HTMLElement ? target : null;
  const list = from?.closest<HTMLElement>("[data-kin-arrows]");
  if (list && from && (list.dataset.kinArrows === "row") === (axis === "x")) {
    const items = [...list.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.closest("[data-kin-arrows]") === list);
    const next = items[stepIndex(items.indexOf(from.closest<HTMLElement>(FOCUSABLE) ?? from), dir, items.length)];
    if (!next || next === from) return false;
    next.focus();
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
    return true;
  }
  if (axis === "x" && (!from || from === document.body)) {
    const day = document.querySelector<HTMLElement>('.cal-rail [aria-current="date"]');
    const items = day ? [...day.parentElement!.querySelectorAll<HTMLAnchorElement>("a[href]")] : [];
    const i = day ? items.indexOf(day as HTMLAnchorElement) : -1;
    const next = i >= 0 ? items[i + dir] : undefined;
    if (!next) return false;
    next.click();
    return true;
  }
  return false;
}
