"use client";

const WEEKDAYS = [
  { value: 0, label: "S", full: "Sunday" },
  { value: 1, label: "M", full: "Monday" },
  { value: 2, label: "T", full: "Tuesday" },
  { value: 3, label: "W", full: "Wednesday" },
  { value: 4, label: "T", full: "Thursday" },
  { value: 5, label: "F", full: "Friday" },
  { value: 6, label: "S", full: "Saturday" },
];

/** Sun-Sat, any number on: the days a weekly thing repeats. Shared by the
 * routine form and the Planner's Add form, so both read the same. Posts each
 * chosen day as a hidden `name` field. */
export function WeekdayPicker({ name, value, onToggle, style }: { name: string; value: number[]; onToggle: (day: number) => void; style?: React.CSSProperties }) {
  return (
    <div role="group" aria-label="Days of the week" style={{ display: "flex", gap: "0.3125rem", ...style }}>
      {WEEKDAYS.map((d) => {
        const on = value.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            onClick={() => onToggle(d.value)}
            aria-pressed={on}
            aria-label={d.full}
            style={{
              flex: 1,
              minHeight: "2.5rem",
              borderRadius: 999,
              border: 0,
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "0.875rem",
              fontWeight: on ? 600 : 500,
              background: on ? "var(--color-accent-solid)" : "color-mix(in srgb, var(--color-text) 6%, transparent)",
              color: on ? "#fff" : "var(--color-text)",
            }}
          >
            {d.label}
          </button>
        );
      })}
      {value.map((d) => (
        <input key={d} type="hidden" name={name} value={d} />
      ))}
    </div>
  );
}
