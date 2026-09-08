"use client";

import { useState, type ComponentProps } from "react";
import { spellDate } from "@/lib/format";

/** A native date input with the date written out beneath it.
 *
 * The picker itself is left alone on purpose. On a phone the native one is a
 * great deal better than anything we would build, and it is what everyone in
 * the household already knows how to use. It is only its *rendering* that
 * ignores the household's date_format -- the browser's locale decides that,
 * and the page has no say -- so the fix goes underneath rather than replacing
 * it.
 *
 * Takes either shape, because both are in use: most of these forms are
 * uncontrolled and pass `defaultValue`, while the transact and shopping-day
 * ones hold the date in their own state and pass `value`. Whichever arrives is
 * passed straight through untouched, so no form's submit behaviour changes;
 * the state here only keeps the line underneath in step. */
export function DateInput({ defaultValue, value, onChange, ...rest }: Omit<ComponentProps<"input">, "type">) {
  const [typed, setTyped] = useState(typeof defaultValue === "string" ? defaultValue : "");
  // A parent holding the value is the authority; otherwise it is what we saw typed.
  const current = typeof value === "string" ? value : typed;
  const spelled = spellDate(current);

  return (
    <>
      <input
        {...rest}
        type="date"
        {...(value !== undefined ? { value } : { defaultValue })}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange?.(e);
        }}
      />
      {spelled && <p className="date-echo">{spelled}</p>}
    </>
  );
}
