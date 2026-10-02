"use client";

import { useRef, useState } from "react";
import { amountDisplay, amountValue, caretAfterReformat, finishAmountInput, groupAmountInput } from "@/lib/amount-input";

/** A money field that reads as an accounting figure -- "12,345.00" -- while
 * it is typed, and still submits the plain number under `name` from a hidden
 * input beside it, so the server action reading it doesn't have to know the
 * difference. A form that keeps the amount in state instead passes
 * `onValueChange` and may leave `name` off.
 *
 * A starting amount of zero shows as an empty field with "0.00" as its
 * placeholder, not as a typed "0": a controlled number input holding 0 kept
 * that zero in front of whatever came next, so typing 1000 read "01000". */
export function AmountInput({
  name,
  id,
  defaultValue,
  placeholder = "0.00",
  ariaLabel,
  style,
  onValueChange,
}: {
  name?: string;
  id?: string;
  defaultValue?: number | string | null;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
  onValueChange?: (value: number) => void;
}) {
  const [display, setDisplay] = useState(() => (Number(defaultValue) === 0 ? "" : amountDisplay(defaultValue)));
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        id={id}
        className="input"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={placeholder}
        value={display}
        onChange={(e) => {
          const raw = e.target.value;
          const next = groupAmountInput(raw);
          const caret = caretAfterReformat(raw, e.target.selectionStart ?? raw.length, next);
          setDisplay(next);
          onValueChange?.(Number(amountValue(next)) || 0);
          // React puts the caret at the end when a controlled value changes
          // length; put it back where the person was typing.
          requestAnimationFrame(() => {
            if (document.activeElement === ref.current) ref.current?.setSelectionRange(caret, caret);
          });
        }}
        onBlur={() => setDisplay((d) => finishAmountInput(d))}
        style={style}
      />
      {name && <input type="hidden" name={name} value={amountValue(display)} />}
    </>
  );
}
