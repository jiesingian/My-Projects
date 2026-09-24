"use client";

import { useRef, useState } from "react";
import { amountDisplay, amountValue, caretAfterReformat, finishAmountInput, groupAmountInput } from "@/lib/amount-input";

/** A money field that reads as an accounting figure -- "12,345.00" -- while
 * it is typed, and still submits the plain number under `name` from a hidden
 * input beside it, so the server action reading it doesn't have to know the
 * difference. */
export function AmountInput({
  name,
  defaultValue,
  placeholder,
  ariaLabel,
  style,
}: {
  name: string;
  defaultValue?: number | string | null;
  placeholder?: string;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  const [display, setDisplay] = useState(() => amountDisplay(defaultValue));
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
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
          // React puts the caret at the end when a controlled value changes
          // length; put it back where the person was typing.
          requestAnimationFrame(() => {
            if (document.activeElement === ref.current) ref.current?.setSelectionRange(caret, caret);
          });
        }}
        onBlur={() => setDisplay((d) => finishAmountInput(d))}
        style={style}
      />
      <input type="hidden" name={name} value={amountValue(display)} />
    </>
  );
}
