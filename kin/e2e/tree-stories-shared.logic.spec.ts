import { test, expect } from "@playwright/test";
import { storyShareHint, linkedStoryFoot } from "@/lib/tree-stories";

/** Stories shared with linked households (19 October): what the switch and
 * a shared story say. */

test("the switch names the households that will see the story", () => {
  expect(storyShareHint("Lola", ["the Reyes"])).toBe("the Reyes has Lola on their tree and will see it, with its recordings and photos. They can't change it.");
  expect(storyShareHint("Lola", ["Reyes", "Cruz", "Reyes", " "])).toMatch(/^Reyes and Cruz have Lola/);
  expect(storyShareHint("Lola", ["A", "B", "C"])).toMatch(/^A, B and C have/);
});

test("with no match yet, the switch says nobody sees it until one is made", () => {
  expect(storyShareHint("Lolo", [])).toBe("No linked household has Lolo on their tree yet. Once one matches Lolo with you, they'll see the stories you share.");
});

test("a story from another household says where it came from and who added it", () => {
  expect(linkedStoryFoot("The Reyes", "Tess Reyes")).toBe("From The Reyes · added by Tess");
  expect(linkedStoryFoot("The Reyes", null)).toBe("From The Reyes");
  expect(linkedStoryFoot(" ", "")).toBe("From a linked household");
});
