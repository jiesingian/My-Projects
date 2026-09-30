"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { Place } from "@/lib/places";
import { MIN_QUERY } from "@/lib/places";

/** A location field that suggests places as you type, from OpenStreetMap
 * through Kin's own route (api/places) -- never straight from the browser.
 *
 * It is still a plain text field: whatever is typed is what gets saved, and a
 * suggestion only fills it in when tapped. "Lola's house" or "the usual
 * court" is a perfectly good location, and no search service knows it.
 *
 * It waits for a pause in typing before asking, so a word typed at speed is
 * one search and not ten. */
export function PlaceInput({
  name,
  defaultValue,
  placeholder,
  maxLength = 200,
  id,
  ariaLabel,
  style,
  onPick,
  value: controlled,
  onChange,
  disabled,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  maxLength?: number;
  id?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  /** Also told the whole place, for a form with a field per part. */
  onPick?: (place: Place) => void;
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-places`;
  const [own, setOwn] = useState(defaultValue ?? "");
  const text = controlled ?? own;
  const [places, setPlaces] = useState<Place[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  // Only a search the person typed asks for suggestions; filling the field
  // from a pick must not search for what was just picked.
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current) return;
    const q = text.trim();
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!response.ok) return;
        const json = (await response.json()) as { places?: Place[] };
        setPlaces(json.places ?? []);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted by the next keystroke, or offline: no suggestions.
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  const set = (v: string) => {
    if (controlled === undefined) setOwn(v);
    onChange?.(v);
  };

  const pick = (p: Place) => {
    typed.current = false;
    set(p.label.slice(0, maxLength));
    onPick?.(p);
    setOpen(false);
    setPlaces([]);
  };

  const showing = open && places.length > 0 && text.trim().length >= MIN_QUERY;

  return (
    <div className="kin-place">
      <input
        id={id}
        className="input"
        name={name}
        value={text}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        style={style}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing && active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => {
          typed.current = true;
          set(e.target.value);
        }}
        onBlur={() => setOpen(false)}
        onFocus={() => places.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => (i + 1) % places.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => (i <= 0 ? places.length - 1 : i - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(places[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {showing && (
        <ul id={listId} role="listbox" className="kin-place-list">
          {places.map((p, i) => (
            <li
              key={p.label}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="kin-place-option"
              // Before the input's blur, so the tap lands on the option.
              onPointerDown={(e) => {
                e.preventDefault();
                pick(p);
              }}
            >
              {p.label}
            </li>
          ))}
          <li className="kin-place-credit" aria-hidden="true">© OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  );
}
