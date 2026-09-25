"use client";

import { Drawer } from "vaul";

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
  labelledBy,
  describedBy,
  role = "dialog",
  panelClassName = "",
  panelStyle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  role?: "dialog" | "alertdialog";
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <Drawer.Root
      open={open}
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
