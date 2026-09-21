"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Blueprint } from "@/components/ui";
import { Icon } from "@/components/icons";
import { initials } from "@/lib/format";
import { addLiquidIntakeAction, setLiquidIntakeAction } from "@/lib/actions/household";
import { LIQUID_INTAKE_TYPES, LIQUID_INTAKE_LABEL, type LiquidIntakeType, type LiquidIntakeMember } from "@/lib/liquid-intake";

const LONG_PRESS_MS = 450;
const MAX_GLASSES = 24;

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
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--color-neutral-600)", marginBottom: 9 }}>
        Liquid intake
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {members.map((m) => (
          <MemberIntakeRow key={m.id} date={date} member={m} />
        ))}
      </div>
    </div>
  );
}

function MemberIntakeRow({ date, member }: { date: string; member: LiquidIntakeMember }) {
  return (
    <Blueprint style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <Avatar url={member.avatarUrl} initials={initials(member.name)} label={member.name} size={34} clickable={false} />
      <span style={{ fontSize: 13.5, fontWeight: 500, flex: "1 1 auto", minWidth: 90 }}>{member.name}</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {LIQUID_INTAKE_TYPES.map((type) => (
          <GlassButton key={type} date={date} memberId={member.id} type={type} glasses={member.glasses[type]} />
        ))}
      </div>
    </Blueprint>
  );
}

function GlassButton({ date, memberId, type, glasses }: { date: string; memberId: string; type: LiquidIntakeType; glasses: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const startHold = () => {
    held.current = false;
    timer.current = setTimeout(() => {
      held.current = true;
      setPicking(true);
    }, LONG_PRESS_MS);
  };
  const endHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const tap = () => {
    setError(null);
    startTransition(async () => {
      const result = await addLiquidIntakeAction({ memberId, type, date, current: glasses });
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  const pick = (n: number) => {
    setPicking(false);
    setError(null);
    startTransition(async () => {
      const result = await setLiquidIntakeAction({ memberId, type, date, glasses: n });
      if (result.error) setError(result.error);
      router.refresh();
    });
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={pending}
        aria-label={`${LIQUID_INTAKE_LABEL[type]}: ${glasses} glass${glasses === 1 ? "" : "es"} today. Tap to add one, hold to set the count.`}
        style={{ minHeight: 32, fontSize: 12.5, padding: "0 10px", gap: 5, color: "var(--color-text)" }}
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          tap();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setPicking(true);
        }}
      >
        <Icon name="glassWater" size={14} style={{ color: TYPE_TINT[type] }} />
        {LIQUID_INTAKE_LABEL[type]}
        <span style={{ fontWeight: 600 }}>{glasses}</span>
      </button>

      {picking && <GlassPicker current={glasses} onPick={pick} onClose={() => setPicking(false)} />}
      {error && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, fontSize: 11.5, color: "var(--cal-occasion)", whiteSpace: "nowrap" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function GlassPicker({ current, onPick, onClose }: { current: number; onPick: (n: number) => void; onClose: () => void }) {
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

  const options = Array.from({ length: MAX_GLASSES + 1 }, (_, n) => n);

  return (
    <div
      ref={wrap}
      role="menu"
      aria-label="Set the count"
      className="kin-glass-bar"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        zIndex: 50,
        width: 200,
        maxHeight: 220,
        overflowY: "auto",
        padding: 6,
        borderRadius: 14,
        border: "1px solid var(--color-divider)",
        boxShadow: "var(--shadow-lg)",
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: 4,
      }}
    >
      {options.map((n) => (
        <button
          key={n}
          type="button"
          role="menuitemradio"
          aria-checked={n === current}
          onClick={() => onPick(n)}
          style={{
            minHeight: 32,
            border: 0,
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 13,
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
