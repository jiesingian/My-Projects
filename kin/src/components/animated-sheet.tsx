"use client";

import { useSyncExternalStore } from "react";
import { Drawer } from "vaul";

/** The width at which the sidebar replaces the tab bar (globals.css), and a
 * sheet becomes a centred dialog. */
const DESKTOP = "(min-width: 1024px)";
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
  return (
    <Drawer.Root
      open={open}
      handleOnly={desktop}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="sheet-backdrop" />
        <Drawer.Content
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
