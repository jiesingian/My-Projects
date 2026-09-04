import { normalizeKey } from "@/lib/pricebook";

export const RECIPE_PHOTO_BUCKET = "recipe-photos";

/** One name for a dish, wherever it turns up: a recipe the household wrote,
 * one Kin ships, or something typed straight into the plan. A photo is of
 * the dish, so it hangs on the dish's name rather than on the row that
 * happened to be used — set it once and every Wednesday adobo has it, in the
 * plan and in the recipe book alike. Rename the dish and the photo is left
 * behind with the old name, which is the honest reading of a rename. */
export function recipeRef(dish: { dish: string }): string {
  return `dish:${normalizeKey(dish.dish)}`;
}

/** Six glazes for the plate a dish gets before anyone photographs it. They
 * are picked by hand rather than spun from the hue wheel: an even sweep of
 * hues runs straight through lime and cyan, and nobody wants to eat those.
 * These are the colours food is actually browned, spiced and stewed to. */
const PLATES = [
  { from: "#b8603a", to: "#4f1e0e" }, // terracotta
  { from: "#c28a30", to: "#5a3207" }, // saffron
  { from: "#a83a2c", to: "#47110d" }, // paprika
  { from: "#6f7f3a", to: "#283110" }, // herb
  { from: "#7a3a5c", to: "#2d1026" }, // plum
  { from: "#8a5a2e", to: "#361d0f" }, // cinnamon
];

/** One glaze by number, for things that should not be left to a hash — the
 * category rail, where two neighbours must not come out the same colour. */
export function plateAt(index: number): { from: string; to: string; ink: string } {
  return { ...PLATES[((index % PLATES.length) + PLATES.length) % PLATES.length], ink: "#fdf3e2" };
}

/** The plate for one dish. Chosen from the name, so a dish keeps the same
 * one everywhere it appears instead of changing on every rebuild. */
export function plateTone(name: string): { from: string; to: string; ink: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 4096;
  const plate = PLATES[h % PLATES.length];
  // Warm off-white — the colour of good china, not of a screen.
  return { ...plate, ink: "#fdf3e2" };
}
