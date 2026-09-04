// Thin-stroke line glyphs, 24×24, single path each — vendored from the
// Claude Design prototype (no icon CDN dependency).
export const iconPaths = {
  chevronLeft: "M15 18 9 12 15 6",
  // Two chevrons: the mark for a control that cycles through a set of values.
  chevronUpDown: "M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4",
  users:
    "M8 11a3.2 3.2 0 1 0 0-6.4a3.2 3.2 0 0 0 0 6.4M2.5 19.5c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M15.5 5.2a3 3 0 0 1 0 5.9M17 14.2c2.6.4 4.5 2.4 4.5 5.3",
  images: "M9 3h12v12H9zM3 9v12h12M12 11.5l2-2.5 3.5 4.5H11z",
  calendarDays:
    "M4 6h16v15H4zM4 10h16M8 3v4M16 3v4M8.5 14h1M12 14h1M15.5 14h1M8.5 17.5h1M12 17.5h1",
  house: "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5",
  housePlus: "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9.5 15.5h5M12 13v5",
  wallet:
    "M3 6.5h15.5a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5H5.5A2.5 2.5 0 0 1 3 18zM16 13.5h3M3 6.5a2 2 0 0 1 2-2h11.5",
  layoutGrid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  shieldCheck: "M12 3l8 3v6c0 5-3.5 8-8 9.5C7.5 20 4 17 4 12V6zM8.5 12l2.5 2.5 4.5-5",
  keyRound: "M17 2.8a4.6 4.6 0 1 0 0 9.2a4.6 4.6 0 0 0 0-9.2M13.8 10.6 3.2 21.2M6.4 18l2.8 2.8",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17M12 11v6M12 7.8h.01",
  copy: "M9 9h11v11H9zM5.5 15H4V4h11v1.5",
  settings:
    "M12 8.6a3.4 3.4 0 1 0 0 6.8a3.4 3.4 0 0 0 0-6.8M19.2 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.4a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3.4a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.4a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z",
  hardDrive: "M3 14.5h18M4.6 5h14.8l2.1 8.2v5.3H2.5v-5.3zM6.5 16.7h.01M10 16.7h.01",
  fileText: "M14 3H6v18h12V7zM14 3v4h4M9 12.5h6M9 16h6",
  download: "M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4 19.5h16",
  upload: "M12 15.5v-11M7.5 8.5 12 4l4.5 4.5M4 19.5h16",
  activity: "M3 12h3.5l2.5-7 4 14 2.5-7H21",
  plus: "M12 4.5v15M4.5 12h15",
  trash: "M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13",
  check: "M4 12.5 9.5 18 20 6",
  x: "M6 6l12 12M18 6 6 18",
  // Calendar category glyphs — so a category's identity never rests on colour.
  plane: "M3 13.5 21 7l-2 5.5-9 3.5-1 4-2-4-4-2.5z",
  utensils: "M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 1-2 3-2 5s.5 3 2 3v10",
  gift: "M3.5 11.5h17V21h-17zM2.5 7.5h19v4h-19zM12 7.5V21M12 7.5S10.5 3 8 3a2.2 2.2 0 0 0 0 4.5M12 7.5S13.5 3 16 3a2.2 2.2 0 0 1 0 4.5",
  target: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
  receipt: "M5 3h14v18l-2.3-1.6-2.4 1.6-2.3-1.6L9.7 21l-2.4-1.6L5 21zM9 8h6M9 12h6",
  // Routines
  repeat: "M4 9.5V8a3 3 0 0 1 3-3h11M15 2.5 18.5 5 15 7.5M20 14.5V16a3 3 0 0 1-3 3H6M9 21.5 5.5 19 9 16.5",
  basket: "M3.5 9h17l-1.7 10.5H5.2zM8 9 10.5 3M16 9 13.5 3M9.5 13v3.5M14.5 13v3.5",
  church: "M12 2.5v5M10 5h4M6 11 12 7.5 18 11v10H6zM10.5 21v-4.5h3V21",
  pause: "M9 5v14M15 5v14",
  play: "M7 4.5 19 12 7 19.5z",
  // Meals
  camera: "M4 8h3l1.5-2.5h7L17 8h3v12H4zM12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17M12 7.5V12l3 2",
  // The kinds of food the recipe book is browsed by. Kept to one flavour of
  // line each, so a rail of them reads as a set rather than a scrapbook.
  bowl: "M3 11.5h18a9 9 0 0 1-18 0M7.5 11.5c.6-3.2 2.4-5 4.5-5s3.9 1.8 4.5 5",
  bowlSteam: "M3 12.5h18a9 9 0 0 1-18 0M8.5 8.5c0-1.6 1.2-2 1.2-3.5M12 8.5c0-1.6 1.2-2 1.2-3.5M15.5 8.5c0-1.6 1.2-2 1.2-3.5",
  steak: "M4.8 10.2c.4-3.6 4-6.2 8.4-5.8s7.3 3.4 6.9 6.8-3.9 6.6-8.3 6.2-7.4-3.6-7-7.2M9.4 9.6l3.2 3.9M12.6 9.1l2.6 3.2",
  fish: "M2.5 12c3.5-4.5 10-6 13.5-2.5s1 8.5-2.5 9.5S5 18 2.5 12M16 9.5 21.5 6v11L16 14M7 12h.01",
  leaf: "M20.5 3.5C9.5 4 4 9 4 15.5c0 2 .8 3.6.8 3.6S7 9.5 19 6.5M4.8 19.1C12 19 18.5 14 20.5 3.5",
  noodles: "M3 12.5h18a9 9 0 0 1-18 0M13.5 9.5 21 3M11 9.5 19 4.5",
  cupcake: "M6 11.5h12l-1.6 8.5H7.6zM7 11.5a3 3 0 0 1 1.2-5.5a3.4 3.4 0 0 1 6.6-.6A3 3 0 0 1 17 11.5",
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({
  name,
  size = 17,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      className={`kin-i inline-flex ${className ?? ""}`}
      style={{ width: size, height: size, ...style }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={iconPaths[name]} />
      </svg>
    </span>
  );
}
