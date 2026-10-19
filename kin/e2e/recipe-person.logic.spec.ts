import { test, expect } from "@playwright/test";
import { recipeHref, recipesByPerson, recipesLine, whoseRecipeLabel } from "@/lib/recipe-person";

/** Whose recipe it is (19 October): "Lola's adobo". */

test("a recipe says whose it is, and nothing when it is nobody's", () => {
  expect(whoseRecipeLabel("Lola Remedios")).toBe("Lola Remedios's recipe");
  expect(whoseRecipeLabel("  ")).toBe("");
  expect(whoseRecipeLabel(null)).toBe("");
});

test("each person's recipes, in order, and nobody's left out", () => {
  const m = recipesByPerson([
    { id: "1", name: "Leche flan", tree_person_id: "lola" },
    { id: "2", name: "Adobo", tree_person_id: "lola" },
    { id: "3", name: "Sinigang", tree_person_id: null },
    { id: "4", name: "Pancit", tree_person_id: "lolo" },
  ]);
  expect(m.get("lola")?.map((r) => r.name)).toEqual(["Adobo", "Leche flan"]);
  expect(m.get("lolo")?.map((r) => r.id)).toEqual(["4"]);
  expect(m.size).toBe(2);
});

test("the panel's line stays short", () => {
  const r = (names: string[]) => names.map((name, i) => ({ id: String(i), name }));
  expect(recipesLine(r(["Adobo"]))).toBe("Adobo");
  expect(recipesLine(r(["Adobo", "Leche flan"]))).toBe("Adobo and Leche flan");
  expect(recipesLine(r(["Adobo", "Leche flan", "Pancit", "Turon"]))).toBe("Adobo, Leche flan and 2 more");
  expect(recipesLine([])).toBe("");
});

test("a recipe opens in the Meals tab's book", () => {
  expect(recipeHref("a1b2")).toBe("/household?seg=meals&recipe=a1b2");
});
