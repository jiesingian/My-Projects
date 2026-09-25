/** Colour themes a member can pick in Settings → Appearance.
 *
 * Each palette names a handful of colours per mode and derives the rest (the
 * neutral and accent ramps the app's inline styles read) with color-mix, so a
 * palette is eight decisions rather than forty. Kin Classic emits nothing:
 * it is globals.css as it stands.
 *
 * The contrast rules every palette has to pass live in
 * e2e/palettes.logic.spec.ts: body text and secondary text on both the page
 * and a card, link-coloured text on a card, and white on a filled button.
 *
 * `darkOnly` palettes are designed for a dark room (Dracula, Midnight). They
 * ignore the light/dark switch, and the root layout forces dark mode, so the
 * rest of the dark tokens (charts, shadows, glass) come along with them. */

export type PaletteMode = {
  bg: string;
  surface: string;
  text: string;
  /** Secondary text: captions, meta lines. neutral-600 in the app. */
  muted: string;
  /** Filled buttons and highlights. White text sits on this. */
  accent: string;
  /** Link-coloured text on a card. accent-700 in the app. */
  ink: string;
  /** The second tint in the page's ambient wash. */
  accent2: string;
  divider: string;
};

export type Palette = {
  id: string;
  name: string;
  /** One line on the picker: what it is and who it suits. */
  blurb: string;
  light: PaletteMode;
  dark: PaletteMode;
  darkOnly?: boolean;
};

export const PALETTE_DEFAULT = "classic";
/** What a profile created from 25 September starts on: the icon's look.
 * PALETTE_DEFAULT stays Kin Classic, because it is also what an unknown or
 * missing id falls back to, and existing people keep their look. */
export const PALETTE_NEW_MEMBER = "coral";

export const PALETTES: Palette[] = [
  {
    id: "classic",
    name: "Kin Classic",
    blurb: "Clean iOS blue on cool grey",
    light: { bg: "#f2f2f7", surface: "#ffffff", text: "#1c1c1e", muted: "#6c6c70", accent: "#007aff", ink: "#0062cc", accent2: "#5ac8fa", divider: "rgba(60,60,67,0.18)" },
    dark: { bg: "#000000", surface: "#1c1c1e", text: "#f5f5f7", muted: "#98989d", accent: "#0a84ff", ink: "#6bb2ff", accent2: "#5ac8fa", divider: "rgba(84,84,88,0.65)" },
  },
  {
    // Kin's own look since the icon changed (#208): the icon's warm orange
    // to coral-pink, on a faintly warm ground. The default for everyone who
    // joins from 25 September; existing people are offered it once on Today
    // and keep whatever they have unless they say yes (item 3).
    //
    // accent is a button background under white text, so it is the icon's
    // coral taken deep enough for 4.5:1 (#d63a55 on white is 4.58:1); ink is
    // accent-coloured text on the page ground, darker again (5.3:1).
    id: "coral",
    name: "Kin Coral",
    blurb: "The icon's warm coral, on soft blush",
    light: { bg: "#fff7f4", surface: "#ffffff", text: "#2a1a1c", muted: "#7a5f60", accent: "#d63a55", ink: "#c02f4a", accent2: "#ff9a4d", divider: "#f3dfd9" },
    dark: { bg: "#1a1112", surface: "#261a1b", text: "#fbecec", muted: "#c7a7a8", accent: "#d63a55", ink: "#ff8a9b", accent2: "#ffb07a", divider: "#3d2a2c" },
  },
  {
    id: "hearth",
    name: "Hearth",
    blurb: "Warm cream, slate and emerald",
    light: { bg: "#fdfbf7", surface: "#ffffff", text: "#1e293b", muted: "#64748b", accent: "#047857", ink: "#047857", accent2: "#f59e0b", divider: "#ebe4d8" },
    dark: { bg: "#14120f", surface: "#1f1c18", text: "#f5f1ea", muted: "#a8a29e", accent: "#047857", ink: "#34d399", accent2: "#f59e0b", divider: "#35302a" },
  },
  {
    id: "nord",
    name: "Nord",
    blurb: "Calm arctic blues and frost",
    light: { bg: "#eceff4", surface: "#ffffff", text: "#2e3440", muted: "#4c566a", accent: "#4a6a94", ink: "#3b5b85", accent2: "#88c0d0", divider: "#d8dee9" },
    dark: { bg: "#2e3440", surface: "#3b4252", text: "#eceff4", muted: "#b4bccb", accent: "#4a6a94", ink: "#88c0d0", accent2: "#81a1c1", divider: "#4c566a" },
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    blurb: "Soft pastels: Latte by day, Mocha by night",
    light: { bg: "#eff1f5", surface: "#ffffff", text: "#4c4f69", muted: "#5c5f77", accent: "#1e5fe0", ink: "#1e5fe0", accent2: "#ea76cb", divider: "#dce0e8" },
    dark: { bg: "#1e1e2e", surface: "#313244", text: "#cdd6f4", muted: "#a6adc8", accent: "#7c3aed", ink: "#cba6f7", accent2: "#f5c2e7", divider: "#45475a" },
  },
  {
    id: "solarized",
    name: "Solarized",
    blurb: "The classic parchment and teal",
    light: { bg: "#fdf6e3", surface: "#fffbf0", text: "#073642", muted: "#586e75", accent: "#1f6fa8", ink: "#1f6fa8", accent2: "#2aa198", divider: "#eee8d5" },
    dark: { bg: "#002b36", surface: "#073642", text: "#eee8d5", muted: "#93a1a1", accent: "#1f6fa8", ink: "#6cb8ea", accent2: "#2aa198", divider: "#0f4a57" },
  },
  {
    id: "sakura",
    name: "Sakura",
    blurb: "Blush pink and deep rose",
    light: { bg: "#fff7f8", surface: "#ffffff", text: "#3b1f2b", muted: "#7a5a66", accent: "#c2185b", ink: "#ad1457", accent2: "#f8bbd0", divider: "#f6dfe6" },
    dark: { bg: "#1a1216", surface: "#261a20", text: "#fbeff3", muted: "#c4a7b2", accent: "#c2185b", ink: "#f48fb1", accent2: "#f06292", divider: "#3d2a33" },
  },
  {
    id: "forest",
    name: "Forest",
    blurb: "Moss, pine and bark",
    light: { bg: "#f4f7f2", surface: "#ffffff", text: "#1f2a1f", muted: "#56655a", accent: "#2f6b3a", ink: "#2f6b3a", accent2: "#a3b18a", divider: "#dfe7da" },
    dark: { bg: "#0f1511", surface: "#18211a", text: "#e8f0e8", muted: "#9fb3a3", accent: "#2f7d43", ink: "#7fd08f", accent2: "#588157", divider: "#2a3a2d" },
  },
  {
    id: "ocean",
    name: "Ocean",
    blurb: "Sea glass and deep teal",
    light: { bg: "#f0f7fa", surface: "#ffffff", text: "#0b2530", muted: "#4e6b77", accent: "#0e7490", ink: "#0e7490", accent2: "#67e8f9", divider: "#d6e8ef" },
    dark: { bg: "#06141a", surface: "#0e222b", text: "#e3f4f8", muted: "#93b4bf", accent: "#0e7490", ink: "#5ec8e0", accent2: "#22d3ee", divider: "#1b3a46" },
  },
  {
    id: "sunset",
    name: "Sunset",
    blurb: "Terracotta, apricot and sand",
    light: { bg: "#fff8f3", surface: "#ffffff", text: "#2b1a12", muted: "#735a4c", accent: "#c2410c", ink: "#b13b0b", accent2: "#fdba74", divider: "#f3e2d6" },
    dark: { bg: "#1a120e", surface: "#261b15", text: "#fbeee6", muted: "#c4a898", accent: "#c2410c", ink: "#fdba74", accent2: "#fb923c", divider: "#3d2c22" },
  },
  {
    id: "lavender",
    name: "Lavender",
    blurb: "Lilac, violet and plum",
    light: { bg: "#f7f5fc", surface: "#ffffff", text: "#231d3a", muted: "#625b7c", accent: "#6d28d9", ink: "#6d28d9", accent2: "#c4b5fd", divider: "#e6e1f3" },
    dark: { bg: "#13111c", surface: "#1d1a2a", text: "#eeeaf8", muted: "#aba3c7", accent: "#6d28d9", ink: "#c4b5fd", accent2: "#a78bfa", divider: "#2f2a44" },
  },
  // Five added 25 September from Janine's list. Each keeps the list's own
  // colours where they are readable -- the ground, the ambient wash, text and
  // links -- and where a colour is too light to carry white button text (the
  // test's 4.5:1), the button takes a deeper shade of the same hue instead:
  // #0096D1 is 3.34:1 under white, #9CCD62 1.85, #3B82F6 3.68, #52ADA2 2.67.
  {
    id: "milk",
    name: "Pale Milk",
    blurb: "Ocean blue on warm pale milk",
    light: { bg: "#fff4ea", surface: "#ffffff", text: "#1b2530", muted: "#5e6670", accent: "#0077a8", ink: "#006d99", accent2: "#0096d1", divider: "#f0e2d4" },
    dark: { bg: "#0b1720", surface: "#13222d", text: "#fff4ea", muted: "#a9b7c2", accent: "#0077a8", ink: "#4fc0ec", accent2: "#0096d1", divider: "#22384a" },
  },
  {
    id: "editorial",
    name: "Editorial",
    blurb: "Warm neutrals with a terracotta accent",
    light: { bg: "#f5f0eb", surface: "#fafaf8", text: "#1c1917", muted: "#6b625a", accent: "#c2410c", ink: "#a8380a", accent2: "#e3c3a8", divider: "#e6ddd3" },
    dark: { bg: "#171412", surface: "#221e1b", text: "#f5f0eb", muted: "#b3a89e", accent: "#c2410c", ink: "#f0a27a", accent2: "#c2410c", divider: "#38302a" },
  },
  {
    id: "electric",
    name: "Electric Blue",
    blurb: "Electric blue and slate, crisp and professional",
    light: { bg: "#f1f5f9", surface: "#ffffff", text: "#1e293b", muted: "#475569", accent: "#2563eb", ink: "#1d4ed8", accent2: "#3b82f6", divider: "#e2e8f0" },
    dark: { bg: "#0f172a", surface: "#1e293b", text: "#f1f5f9", muted: "#a3b1c6", accent: "#2563eb", ink: "#7fb0fa", accent2: "#3b82f6", divider: "#334155" },
  },
  {
    id: "emerald",
    name: "Emerald Wave",
    blurb: "Emerald and brook green, calm and restful",
    light: { bg: "#eef7f4", surface: "#ffffff", text: "#13302b", muted: "#4f6b65", accent: "#2b7a70", ink: "#246b62", accent2: "#addcca", divider: "#d5ebe3" },
    dark: { bg: "#0d1a18", surface: "#152623", text: "#e6f4ef", muted: "#9fbfb7", accent: "#2b7a70", ink: "#7fd1c4", accent2: "#52ada2", divider: "#24403b" },
  },
  {
    // Dark by design, as the list has it: Antarctic Deep is the ground and
    // Woodland Green the highlight. The green is far too light under white
    // text, so buttons are a deep woodland and the green itself is the links.
    id: "antarctic",
    name: "Antarctic",
    blurb: "Deep grey with woodland green, for dark rooms",
    darkOnly: true,
    light: { bg: "#3a3c42", surface: "#45474e", text: "#f2f3ef", muted: "#c6c9cf", accent: "#3d7a1f", ink: "#9ccd62", accent2: "#9ccd62", divider: "#55585f" },
    dark: { bg: "#3a3c42", surface: "#45474e", text: "#f2f3ef", muted: "#c6c9cf", accent: "#3d7a1f", ink: "#9ccd62", accent2: "#9ccd62", divider: "#55585f" },
  },
  {
    id: "dracula",
    name: "Dracula",
    blurb: "The developers' favourite dark theme",
    darkOnly: true,
    light: { bg: "#282a36", surface: "#343746", text: "#f8f8f2", muted: "#b4b8cf", accent: "#7c3aed", ink: "#bd93f9", accent2: "#ff79c6", divider: "#44475a" },
    dark: { bg: "#282a36", surface: "#343746", text: "#f8f8f2", muted: "#b4b8cf", accent: "#7c3aed", ink: "#bd93f9", accent2: "#ff79c6", divider: "#44475a" },
  },
  {
    id: "midnight",
    name: "Midnight",
    blurb: "True black, easy on OLED screens at night",
    darkOnly: true,
    light: { bg: "#000000", surface: "#0f0f10", text: "#f2f2f2", muted: "#a1a1a6", accent: "#2563eb", ink: "#7aa7ff", accent2: "#1e3a8a", divider: "#26262a" },
    dark: { bg: "#000000", surface: "#0f0f10", text: "#f2f2f2", muted: "#a1a1a6", accent: "#2563eb", ink: "#7aa7ff", accent2: "#1e3a8a", divider: "#26262a" },
  },
  {
    id: "contrast",
    name: "High contrast",
    blurb: "Maximum legibility: black, white and bold blue",
    light: { bg: "#ffffff", surface: "#ffffff", text: "#000000", muted: "#2b2b2b", accent: "#0038b8", ink: "#0030a0", accent2: "#0038b8", divider: "#000000" },
    dark: { bg: "#000000", surface: "#000000", text: "#ffffff", muted: "#e6e6e6", accent: "#0050e6", ink: "#a8c8ff", accent2: "#0050e6", divider: "#ffffff" },
  },
];

export function paletteById(id: string | null | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function isPaletteId(id: string): boolean {
  return PALETTES.some((p) => p.id === id);
}

function tokens(m: PaletteMode): string {
  const mix = (a: string, pct: number, b: string) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;
  return [
    `--color-bg:${m.bg}`,
    `--color-surface:${m.surface}`,
    `--color-text:${m.text}`,
    `--color-divider:${m.divider}`,
    `--color-accent:${m.accent}`,
    `--color-accent-2:${m.accent2}`,
    `--color-neutral-100:${mix(m.text, 4, m.surface)}`,
    `--color-neutral-200:${mix(m.text, 8, m.surface)}`,
    `--color-neutral-300:${mix(m.text, 13, m.surface)}`,
    `--color-neutral-400:${mix(m.text, 24, m.surface)}`,
    `--color-neutral-500:${mix(m.muted, 70, m.surface)}`,
    `--color-neutral-600:${m.muted}`,
    `--color-neutral-700:${mix(m.text, 55, m.muted)}`,
    `--color-neutral-800:${mix(m.text, 85, m.muted)}`,
    `--color-neutral-900:${m.text}`,
    `--color-accent-100:${mix(m.accent, 12, m.surface)}`,
    `--color-accent-200:${mix(m.accent, 22, m.surface)}`,
    `--color-accent-300:${mix(m.accent, 40, m.surface)}`,
    `--color-accent-400:${mix(m.accent, 65, m.surface)}`,
    `--color-accent-500:${mix(m.accent, 85, m.surface)}`,
    `--color-accent-600:${m.accent}`,
    `--color-accent-700:${m.ink}`,
    `--color-accent-800:${mix(m.ink, 70, m.text)}`,
    `--color-accent-900:${mix(m.ink, 45, m.text)}`,
    `--glass-bg:color-mix(in srgb, ${m.surface} 72%, transparent)`,
    `--glass-border:color-mix(in srgb, ${m.text} 10%, transparent)`,
  ].join(";");
}

/** The stylesheet for one palette, or an empty string for Kin Classic.
 *
 * Selectors are `html:root…`, one element heavier than globals.css's own
 * `:root…` rules, so each palette wins in the mode it is written for and
 * globals.css still supplies whatever a palette does not name (chart colours,
 * shadows) for the mode actually showing. */
export function paletteCss(id: string | null | undefined): string {
  const p = paletteById(id);
  if (p.id === PALETTE_DEFAULT) return "";
  const light = tokens(p.light);
  const dark = tokens(p.dark);
  if (p.darkOnly) return `html:root{${dark};color-scheme:dark}`;
  return (
    `html:root{${light}}` +
    `html:root[data-theme="dark"]{${dark}}` +
    `@media (prefers-color-scheme: dark){html:root:not([data-theme="light"]){${dark}}}`
  );
}

/** WCAG relative-luminance contrast between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
