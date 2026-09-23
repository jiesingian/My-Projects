"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { addLiquidIntakeAction, setLiquidIntakeAction } from "@/lib/actions/household";
import { LIQUID_INTAKE_TYPES, LIQUID_INTAKE_LABEL, MAX_GLASSES, type LiquidIntakeType, type LiquidIntakeMember } from "@/lib/liquid-intake";

const LONG_PRESS_MS = 450;

const TYPE_TINT: Record<LiquidIntakeType, string> = {
  water: "var(--cal-appointment)",
  juice: "var(--cal-birthday)",
  milk: "var(--color-neutral-600)",
};

/** Per member, per drink: a tap logs one more glass for today, a long press
 * (or a right click, for a mouse) opens a picker to set the day's count
 * outright -- for a mis-tap, or logging several at once from memory. */
export function LiquidIntakeTracker({ date, members }: { date: string; members: LiquidIntakeMember[] }) {
  if (members.length === 0) return null;

  return (
    <div style={{ marginTop: "1.125rem" }}>
      <div style={{ fontSize: "0.71875rem", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: "0.5625rem" }}>
        Liquid intake
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {members.map((m) => (
          <MemberIntakeRow key={m.id} date={date} member={m} />
        ))}
      </div>
    </div>
  );
}

function MemberIntakeRow({ date, member }: { date: string; member: LiquidIntakeMember }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<LiquidIntakeType | null>(null);

  const run = (fn: () => Promise<{ error: string | null }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  const pick = (type: LiquidIntakeType, glasses: number) => {
    setPicking(null);
    run(() => setLiquidIntakeAction({ memberId: member.id, type, date, glasses }));
  };

  return (
    <Blueprint style={{ padding: "0.625rem 0.75rem", display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap" }}>
      <Avatar url={member.avatarUrl} initials={initials(member.name)} label={member.name} size={34} clickable={false} />
      <span style={{ fontSize: "0.84375rem", fontWeight: 500, flex: "1 1 auto", minWidth: "5.625rem" }}>{member.name}</span>

      {/* The picker hangs from the whole group rather than from the button
          that opened it. Hung off Milk, which sits at the right-hand end, a
          fixed-width menu ran past the edge of a phone and took the page
          sideways with it. */}
      <div style={{ position: "relative", display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        {LIQUID_INTAKE_TYPES.map((type) => (
          <GlassButton
            key={type}
            type={type}
            glasses={member.glasses[type]}
            disabled={pending}
            onTap={() => run(() => addLiquidIntakeAction({ memberId: member.id, type, date }))}
            onHold={() => setPicking(type)}
          />
        ))}
        {picking && (
          <GlassPicker
            label={LIQUID_INTAKE_LABEL[picking]}
            current={member.glasses[picking]}
            onPick={(n) => pick(picking, n)}
            onClose={() => setPicking(null)}
          />
        )}
      </div>

      {error && <div style={{ flexBasis: "100%", fontSize: "0.75rem", color: "var(--cal-occasion)" }}>{error}</div>}
    </Blueprint>
  );
}

function GlassButton({
  type,
  glasses,
  disabled,
  onTap,
  onHold,
}: {
  type: LiquidIntakeType;
  glasses: number;
  disabled: boolean;
  onTap: () => void;
  onHold: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const startHold = () => {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      onHold();
    }, LONG_PRESS_MS);
  };
  const endHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={disabled}
      aria-label={`${LIQUID_INTAKE_LABEL[type]}: ${glasses} glass${glasses === 1 ? "" : "es"} today. Tap to add one, hold to set the count.`}
      style={{ minHeight: "2rem", fontSize: "0.78125rem", padding: "0 0.625rem", gap: "0.3125rem", color: "var(--color-text)" }}
      onPointerDown={startHold}
      onPointerUp={endHold}
      onPointerLeave={endHold}
      onPointerCancel={endHold}
      // A hold has already opened the picker; the click that ends it must not
      // also log a glass.
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        onTap();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onHold();
      }}
    >
      <Icon name="glassWater" size={14} style={{ color: TYPE_TINT[type] }} />
      {LIQUID_INTAKE_LABEL[type]}
      <span style={{ fontWeight: 600 }}>{glasses}</span>
    </button>
  );
}

function GlassPicker({
  label,
  current,
  onPick,
  onClose,
}: {
  label: string;
  current: number;
  onPick: (n: number) => void;
  onClose: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={wrap}
      role="menu"
      aria-label={`How many glasses of ${label.toLowerCase()} today`}
      className="kin-glass-bar"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        // Pinned to both edges of the button group, so it is as wide as the
        // buttons it belongs to and never wider than the card holding them.
        left: 0,
        right: 0,
        zIndex: 50,
        maxHeight: "13.75rem",
        overflowY: "auto",
        padding: "0.375rem",
        borderRadius: 14,
        border: "1px solid var(--color-divider)",
        boxShadow: "var(--shadow-lg)",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(38px, 1fr))",
        gap: "0.25rem",
      }}
    >
      {Array.from({ length: MAX_GLASSES + 1 }, (_, n) => n).map((n) => (
        <button
          key={n}
          type="button"
          role="menuitemradio"
          aria-checked={n === current}
          onClick={() => onPick(n)}
          style={{
            minHeight: "2rem",
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: "0.8125rem",
            fontWeight: n === current ? 600 : 400,
            background: n === current ? "color-mix(in srgb, var(--color-accent) 14%, transparent)" : "transparent",
            color: "var(--color-text)",
          }}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
