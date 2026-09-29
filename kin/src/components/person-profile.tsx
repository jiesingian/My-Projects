"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { AnimatedSheet } from "@/components/animated-sheet";
import { useCalls } from "@/components/call-provider";
import { confirm } from "@/components/confirm-sheet";
import { toast } from "@/components/toast";
import { removeMemberAction } from "@/lib/actions/family";
import { setCoverAction } from "@/lib/actions/profile";

/** Message and Call, under someone's name on their profile. Message opens the
 * family chat addressed to them (@Name, tagged). Call rings them in Kin when
 * they have a login of their own; a managed profile with a phone number gets
 * the phone instead; with neither there is nothing to call. */
export function PersonActions({ memberId, firstName, callable, mobile }: { memberId: string; firstName: string; callable: boolean; mobile: string | null }) {
  const calls = useCalls();
  const canRing = callable && !!calls && calls.members.some((m) => m.id === memberId && m.callable);
  return (
    <div className="kin-profile-actions">
      <Link href={`/chat/household?to=${memberId}`} className="btn btn-primary">
        <Icon name="message" size="1rem" /> Message
      </Link>
      {canRing ? (
        <button type="button" className="btn btn-secondary" disabled={calls.busy} onClick={() => calls.start(memberId, false)}>
          <Icon name="phone" size="1rem" /> Call
        </button>
      ) : mobile ? (
        <a href={`tel:${mobile.replace(/[^\d+]/g, "")}`} className="btn btn-secondary">
          <Icon name="phone" size="1rem" /> Call
        </a>
      ) : (
        <button type="button" className="btn btn-secondary" disabled title={`${firstName} has no login or phone number to call`}>
          <Icon name="phone" size="1rem" /> Call
        </button>
      )}
    </div>
  );
}

/** The "⋯" on a profile's cover: the less common things, including the one
 * that cannot be taken back lightly -- Remove, which used to sit in red on
 * every row of the Family list. */
export function ProfileMoreMenu({
  memberId,
  fullName,
  links,
  canRemove,
}: {
  memberId: string;
  fullName: string;
  links: { label: string; href: string; icon: "shieldCheck" | "activity" | "settings" | "users" }[];
  canRemove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (links.length === 0 && !canRemove) return null;

  async function remove() {
    setOpen(false);
    const yes = await confirm({
      title: `Remove ${fullName} from the household?`,
      description: "They'll lose access immediately — their past journal entries and records stay, and you can reinstate them later.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!yes) return;
    setBusy(true);
    const result = await removeMemberAction(memberId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`${fullName.split(" ")[0]} was removed.`);
    router.push("/family?seg=profile");
  }

  return (
    <div ref={wrap} className="kin-profile-more">
      <button
        type="button"
        className="kin-profile-morebtn"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      <div id={menuId} role="menu" className="kin-profile-menu" data-open={open || undefined} inert={!open}>
        {links.map((l) => (
          <Link key={l.href} href={l.href} role="menuitem" className="kin-profile-menuitem" onClick={() => setOpen(false)}>
            <Icon name={l.icon} size="1rem" /> {l.label}
          </Link>
        ))}
        {canRemove && (
          <button type="button" role="menuitem" className="kin-profile-menuitem" data-danger onClick={remove}>
            <Icon name="trash" size="1rem" /> Remove from household
          </button>
        )}
      </div>
    </div>
  );
}

/** Your own cover: one of your album photos, or none. */
export function CoverPicker({ photos, current }: { photos: { id: string; url: string }[]; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const titleId = useId();

  async function choose(id: string | null) {
    setBusy(true);
    const result = await setCoverAction(id);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="kin-profile-coverbtn" onClick={() => setOpen(true)}>
        <Icon name="camera" size="0.9375rem" /> {current ? "Change cover" : "Add a cover"}
      </button>
      <AnimatedSheet open={open} onClose={() => setOpen(false)} labelledBy={titleId} panelClassName="sheet-panel--confirm">
        <h2 id={titleId} style={{ fontSize: "1.125rem", margin: "0 0 0.25rem" }}>
          Cover photo
        </h2>
        {photos.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--color-neutral-700)", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
            Your cover comes from your profile pictures. Add one on the About tab, and it can be your cover too.
          </p>
        ) : (
          <>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-neutral-700)", margin: "0 0 0.75rem" }}>From your profile pictures.</p>
            <div className="kin-profile-covergrid">
              {photos.map((p) => (
                <button key={p.id} type="button" disabled={busy} data-active={p.id === current || undefined} onClick={() => choose(p.id)} aria-label="Use this photo as your cover">
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs */}
                  <img src={p.url} alt="" />
                </button>
              ))}
            </div>
            {current && (
              <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: "0.875rem" }} disabled={busy} onClick={() => choose(null)}>
                No cover
              </button>
            )}
          </>
        )}
      </AnimatedSheet>
    </>
  );
}
