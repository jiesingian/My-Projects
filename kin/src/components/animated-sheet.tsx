"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { Drawer } from "vaul";

/** The width at which the sidebar replaces the tab bar (globals.css), and a
 * sheet becomes a centred dialog. */
const DESKTOP = "(min-width: 1024px)";

/** Chromium's CloseWatcher: Android's back gesture (and Escape) closing the
 * topmost thing open, without a trip through history. Not in TypeScript's
 * DOM types yet. */
type CloseWatcherLike = { onclose: (() => void) | null; destroy: () => void };
type CloseWatcherCtor = new () => CloseWatcherLike;
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Every bottom sheet in this app, in one place: the confirm dialogs, the
 * recipe book, "Ask Kin".
 *
 * Built on Vaul (https://vaul.emilkowal.ski), which gives the sheet what a
 * phone's own sheets have and a CSS transition can't: it follows the finger
 * when dragged, closes on a flick down or snaps back from a half-hearted
 * one, and doesn't start dragging while the sheet's own content is scrolled.
 * Underneath it is Radix's dialog, so focus is trapped while open and
 * handed back to whatever opened it, Escape and a tap on the backdrop
 * close it, the page behind stops scrolling, and a screen reader hears a
 * modal dialog. The hand-timed mount/unmount dance this file used to do is
 * gone with it.
 *
 * `open` is still the caller's source of truth; this never decides on its
 * own that the sheet is open. The props are the same as before, so nothing
 * that uses a sheet had to change. */
export function AnimatedSheet({
  open,
  onClose,
  onClosed,
  labelledBy,
  label,
  describedBy,
  role = "dialog",
  panelClassName = "",
  panelStyle,
  guardUnsaved = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** After the close animation has finished: for a sheet that is a route
   * (route-sheet.tsx), the moment to go back without cutting the slide short. */
  onClosed?: () => void;
  /** The caller's title element; or, when there is none to point at, a name. */
  labelledBy?: string;
  label?: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  /** A form: a swipe, a tap on the backdrop, Escape or the back gesture
   * asks before throwing away what was typed and is still there. The × and
   * Cancel do not ask; they are said on purpose. */
  guardUnsaved?: boolean;
  children: React.ReactNode;
}) {
  // On a computer the sheet is a centred dialog: a mouse drag inside it is
  // selecting text or nudging a slider, never a flick to close it, so only
  // a handle could drag it -- and there is none.
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  // Typed in since it opened, and not saved since (a list written several
  // items at a time is saved at each Add). And each field's value from the
  // moment it was first touched: only a field that still differs from it
  // counts, so a name typed and deleted again does not ask (Jonathan,
  // 28 October).
  const dirty = useRef(false);
  const before = useRef(new Map<Element, string>());
  const asking = useRef(false);
  useEffect(() => {
    if (open) {
      dirty.current = false;
      before.current = new Map();
    }
  }, [open]);

  // A close the person did not say in so many words: the swipe, the
  // backdrop, Escape, the back gesture. Resolves whether it closed.
  const dismiss = useCallback(async () => {
    if (asking.current) return false;
    const changed = [...before.current].some(([el, was]) => el.isConnected && valueOf(el) !== was);
    const unsaved = guardUnsaved && ((dirty.current && changed) || !!panel.current?.querySelector("[data-unsaved]"));
    if (!unsaved) {
      onClose();
      return true;
    }
    // Vaul has already let go of a swiped sheet; put it back while asking.
    if (panel.current) {
      panel.current.style.transition = "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)";
      panel.current.style.transform = "translate3d(0, 0, 0)";
    }
    if (backdrop.current) backdrop.current.style.opacity = "1";
    asking.current = true;
    // Imported when needed: confirm-sheet is itself built on this file.
    const { confirm } = await import("@/components/confirm-sheet");
    const discard = await confirm({ title: "Discard what you've entered?", description: "It hasn't been saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", danger: true });
    asking.current = false;
    if (discard) onClose();
    return discard;
  }, [guardUnsaved, onClose]);
  const dismissRef = useRef(dismiss);
  useEffect(() => {
    dismissRef.current = dismiss;
  }, [dismiss]);

  // Android's back gesture closes the sheet rather than leaving the page
  // under it (Chromium's CloseWatcher; elsewhere the gesture does what it
  // always did). A watcher is spent once it fires, so one kept open after
  // "Keep editing" gets a new one.
  useEffect(() => {
    if (!open) return;
    const Watcher = (window as unknown as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher;
    if (!Watcher) return;
    let watcher: CloseWatcherLike | null = null;
    let live = true;
    const watch = () => {
      try {
        watcher = new Watcher();
      } catch {
        return;
      }
      watcher.onclose = () => {
        void dismissRef.current().then((closed) => {
          if (!closed && live) watch();
        });
      };
    };
    watch();
    return () => {
      live = false;
      watcher?.destroy();
    };
  }, [open]);

  return (
    <Drawer.Root
      open={open}
      handleOnly={desktop}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
      onOpenChange={(next) => {
        if (!next) void dismiss();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay ref={backdrop} className="sheet-backdrop" />
        <Drawer.Content
          ref={panel}
          onChangeCapture={(e) => {
            if (e.nativeEvent.isTrusted) dirty.current = true;
          }}
          onFocusCapture={(e) => {
            const el = e.target as Element;
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !before.current.has(el)) before.current.set(el, valueOf(el));
          }}
          onSubmitCapture={() => {
            dirty.current = false;
            before.current = new Map();
          }}
          onClickCapture={(e) => {
            // A save that is not a form's submit -- a price, a card, a
            // contact saved by its own button -- starts a fresh count once
            // it has run, so what it just saved is not asked about. Not a
            // toggle that only looks primary (Already paid / Due later).
            const button = (e.target as Element).closest?.('button[type="submit"], button.btn-primary, a.btn-primary');
            if (!button || button.closest("[aria-pressed], [role='radiogroup'], [role='tablist']")) return;
            setTimeout(() => {
              dirty.current = false;
              before.current = new Map();
            }, 0);
          }}
          // The caller's own title and description, not Radix's: they are
          // already on the page with ids of their own.
          role={role}
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : label}
          aria-describedby={describedBy}
          className={`sheet-panel kin-glass-bar ${panelClassName}`}
          style={panelStyle}
        >
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** What a field holds, as one string to compare: its text, whether a box is
 * ticked, how many files are picked. */
function valueOf(el: Element): string {
  if (el instanceof HTMLInputElement) return el.type === "checkbox" || el.type === "radio" ? String(el.checked) : el.type === "file" ? String(el.files?.length ?? 0) : el.value;
  if (el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return el.value;
  return "";
}
