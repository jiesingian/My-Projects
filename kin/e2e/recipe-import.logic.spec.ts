import { test, expect } from "@playwright/test";
import { cleanText, extractRecipe, isPublicAddress, parseDuration, parseIngredientLine, recipeLink } from "@/lib/recipe-import";

/** Save a recipe from a link: reading a schema.org Recipe out of a page,
 * ingredient lines into Kin's rows, and which links and addresses the server
 * will fetch at all. */

const page = (ld: unknown, title = "Chicken Adobo Recipe | Some Blog") => `<!doctype html><html><head><title>${title}</title>
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>…</body></html>`;

test("a WordPress page's recipe, nested in @graph, with sections and HTML in it", () => {
  const html = page({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Chicken Adobo" },
      {
        "@type": ["Recipe"],
        name: "Chicken Adobo &amp; Rice",
        recipeYield: ["4", "4 servings"],
        prepTime: "PT10M",
        cookTime: "PT45M",
        recipeIngredient: ["2 lbs chicken thighs", "1/2 cup soy sauce", "1 head garlic, crushed", "3 pieces dried bay leaves", "salt to taste"],
        recipeInstructions: [
          { "@type": "HowToSection", name: "Marinate", itemListElement: [{ "@type": "HowToStep", text: "<p>Combine chicken, soy sauce and garlic.</p>" }] },
          { "@type": "HowToStep", text: "Simmer for 30 minutes." },
        ],
      },
    ],
  });
  const d = extractRecipe(html, "https://example.com/adobo")!;
  expect(d.found).toBe(true);
  expect(d.name).toBe("Chicken Adobo & Rice");
  expect(d.serves).toBe(4);
  expect(d.minutes).toBe(55);
  expect(d.steps).toEqual(["Combine chicken, soy sauce and garlic.", "Simmer for 30 minutes."]);
  expect(d.ingredients.map((i) => [i.qty, i.unit, i.name])).toEqual([
    [2, "lb", "chicken thighs"],
    [0.5, "cup", "soy sauce"],
    [1, "pc", "head garlic, crushed"],
    [3, "pc", "dried bay leaves"],
    [null, null, "salt to taste"],
  ]);
  expect(d.ingredients[0].section).toBe("Meat");
});

test("instructions as one block of text, totalTime, a numeric yield", () => {
  const d = extractRecipe(page({ "@type": "Recipe", name: "Sinigang", recipeYield: 6, totalTime: "PT1H15M", recipeIngredient: ["1 kg pork ribs"], recipeInstructions: "Boil the pork.\nAdd tamarind." }), "https://x.ph/s")!;
  expect(d.minutes).toBe(75);
  expect(d.serves).toBe(6);
  expect(d.steps).toEqual(["Boil the pork.", "Add tamarind."]);
  expect(d.ingredients[0]).toMatchObject({ qty: 1, unit: "kg", name: "pork ribs" });
});

test("a page with no recipe gives its title, so the editor still opens", () => {
  const html = `<html><head><meta property="og:title" content="Lola&#39;s pancit"><title>x</title></head></html>`;
  const d = extractRecipe(html, "https://www.instagram.com/p/abc/")!;
  expect(d).toMatchObject({ found: false, name: "Lola's pancit", ingredients: [], steps: [] });
  expect(extractRecipe("<html></html>", "https://x.com/")).toBeNull();
  // Broken JSON-LD is skipped, not fatal.
  expect(extractRecipe(`<title>T</title><script type="application/ld+json">{oops</script>`, "https://x.com/")?.found).toBe(false);
});

test("ingredient amounts: fractions, mixed numbers, unicode, ranges, stuck units", () => {
  expect(parseIngredientLine("1 1/2 cups water")).toMatchObject({ qty: 1.5, unit: "cup", name: "water" });
  expect(parseIngredientLine("1½ tbsp fish sauce")).toMatchObject({ qty: 1.5, unit: "tbsp", name: "fish sauce" });
  expect(parseIngredientLine("½ tsp black pepper")).toMatchObject({ qty: 0.5, unit: "tsp", name: "black pepper" });
  expect(parseIngredientLine("2-3 cloves garlic")).toMatchObject({ qty: 2, unit: "clove", name: "garlic" });
  expect(parseIngredientLine("500g ground pork")).toMatchObject({ qty: 500, unit: "g", name: "ground pork", section: "Meat" });
  expect(parseIngredientLine("1 can of coconut milk")).toMatchObject({ qty: 1, unit: "can", name: "coconut milk" });
  expect(parseIngredientLine("2 large eggs")).toMatchObject({ qty: 2, unit: "pc", name: "large eggs" });
});

test("durations", () => {
  expect(parseDuration("PT45M")).toBe(45);
  expect(parseDuration("PT2H")).toBe(120);
  expect(parseDuration("P0DT1H30M")).toBe(90);
  expect(parseDuration("45 minutes")).toBeNull();
  expect(parseDuration(undefined)).toBeNull();
});

test("text: tags out, entities in", () => {
  expect(cleanText("<b>Saut&eacute;</b> &amp; stir&#8212;well&#x21;")).toBe("Saut&eacute; & stir—well!");
});

test("only https links on the public web are tried", () => {
  expect(recipeLink("panlasangpinoy.com/adobo")?.toString()).toBe("https://panlasangpinoy.com/adobo");
  expect(recipeLink("http://site.ph/r#steps")?.toString()).toBe("https://site.ph/r");
  expect(recipeLink("ftp://site.ph/r")).toBeNull();
  expect(recipeLink("https://user:pw@site.ph/")).toBeNull();
  expect(recipeLink("https://site.ph:8080/")).toBeNull();
  expect(recipeLink("https://localhost/")).toBeNull();
  expect(recipeLink("")).toBeNull();
});

test("the server never fetches private, loopback or metadata addresses", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
    expect(isPublicAddress(ip), ip).toBe(false);
  for (const ip of ["8.8.8.8", "104.21.3.4", "172.32.0.1", "2606:4700::6810:84e5", "::ffff:8.8.8.8"]) expect(isPublicAddress(ip), ip).toBe(true);
});
