import type { MarketSection } from "@/lib/grocery";
import type { IconName } from "@/components/icons";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** The parts of a day, in the order they happen — which is also the order
 * meals are listed and grouped in. */
export const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

/** What kind of food it is, rather than when it is eaten — how a menu is
 * browsed when nobody has decided what they want yet. A dish belongs to as
 * many as fit: tapsilog is a rice meal and beef. */
export type RecipeCategory = "rice" | "chicken" | "pork" | "beef" | "seafood" | "vegetables" | "soup" | "noodles" | "merienda";

/** In the order they are put in front of a cook: the everyday ones first. */
export const RECIPE_CATEGORIES: RecipeCategory[] = [
  "rice",
  "chicken",
  "pork",
  "beef",
  "seafood",
  "vegetables",
  "soup",
  "noodles",
  "merienda",
];

/** The glyph on a category's tile, until the household's own photo of a dish
 * in it takes over. */
export const RECIPE_CATEGORY_ICON: Record<RecipeCategory, IconName> = {
  rice: "bowl",
  // Colour and label separate the three meats; one honest cut of meat
  // reads better at 24px than three guessable animal parts.
  chicken: "steak",
  pork: "steak",
  beef: "steak",
  seafood: "fish",
  vegetables: "leaf",
  soup: "bowlSteam",
  noodles: "noodles",
  merienda: "cupcake",
};

/** Which glaze each category wears, chosen so no two neighbours in the rail
 * share one. */
export const RECIPE_CATEGORY_PLATE: Record<RecipeCategory, number> = {
  rice: 1,
  chicken: 5,
  pork: 0,
  beef: 2,
  seafood: 4,
  vegetables: 3,
  soup: 2,
  noodles: 5,
  merienda: 1,
};

export const RECIPE_CATEGORY_LABEL: Record<RecipeCategory, string> = {
  rice: "Rice meals",
  chicken: "Chicken",
  pork: "Pork",
  beef: "Beef",
  seafood: "Seafood",
  vegetables: "Vegetables",
  soup: "Soups",
  noodles: "Noodles",
  merienda: "Merienda",
};

/** A first guess for a recipe the household wrote without saying what it is.
 * Wrong sometimes, and always changeable in the editor — better than leaving
 * their own dishes out of every category. */
export function guessCategories(name: string, ingredientNames: string[]): RecipeCategory[] {
  const hay = [name, ...ingredientNames].join(" ").toLowerCase();
  const has = (...words: string[]) => words.some((w) => hay.includes(w));
  const found: RecipeCategory[] = [];

  if (has("chicken", "manok")) found.push("chicken");
  if (has("pork", "baboy", "liempo", "lechon", "longganisa", "bacon")) found.push("pork");
  if (has("beef", "baka", "tapa", "sirloin", "brisket")) found.push("beef");
  if (has("fish", "isda", "bangus", "tilapia", "hipon", "shrimp", "squid", "pusit", "sardinas", "tuna")) found.push("seafood");
  if (has("noodle", "pancit", "spaghetti", "pasta", "bihon", "canton", "sotanghon")) found.push("noodles");
  if (has("sinigang", "soup", "sabaw", "nilaga", "tinola", "bulalo", "caldo", "lugaw")) found.push("soup");
  if (has("rice", "kanin", "silog", "champorado")) found.push("rice");
  if (has("turon", "banana cue", "bilo", "halo-halo", "leche", "cake", "biko", "puto", "merienda")) found.push("merienda");
  if (has("kangkong", "talong", "sitaw", "kalabasa", "gulay", "vegetable", "monggo", "pechay")) found.push("vegetables");

  return found;
}

export type RecipeIngredient = {
  name: string;
  qty: number;
  unit: string;
  section: MarketSection;
};

export type Recipe = {
  key: string;
  name: string;
  /** Where it usually sits in the day; the cook can still put it anywhere. */
  slots: MealSlot[];
  /** What kind of food it is — how the recipe book is browsed. */
  categories: RecipeCategory[];
  serves: number;
  minutes: number;
  ingredients: RecipeIngredient[];
  steps: string[];
};

function i(name: string, qty: number, unit: string, section: MarketSection): RecipeIngredient {
  return { name, qty, unit, section };
}

/** A library of the dishes a Filipino household actually cooks in a week,
 * with what goes into each. Picking one fills in the ingredients, which is
 * the whole point: the meal plan and the shopping list stop being two jobs.
 *
 * Quantities feed a family of four or five. They are a starting point — the
 * cook edits them, and the family's own price book prices them. */
export const RECIPES: Recipe[] = [
  {
    key: "adobo",
    name: "Chicken adobo",
    slots: ["lunch", "dinner"],
    categories: ["chicken"],
    serves: 5,
    minutes: 45,
    ingredients: [
      i("Chicken thigh", 1, "kg", "Meat"),
      i("Soy sauce", 0.5, "bottle", "Condiments & Spices"),
      i("Vinegar", 0.3, "bottle", "Condiments & Spices"),
      i("Garlic", 0.1, "kg", "Produce"),
      i("Bay leaf", 1, "pack", "Condiments & Spices"),
      i("Black pepper", 1, "pack", "Condiments & Spices"),
    ],
    steps: [
      "Marinate the chicken in soy sauce, garlic and pepper for 30 minutes.",
      "Brown the chicken, then add the marinade, vinegar and bay leaf.",
      "Simmer uncovered for 25 minutes until the sauce thickens.",
    ],
  },
  {
    key: "sinigang-baboy",
    name: "Sinigang na baboy",
    slots: ["lunch", "dinner"],
    categories: ["pork", "soup"],
    serves: 5,
    minutes: 60,
    ingredients: [
      i("Pork ribs", 1, "kg", "Meat"),
      i("Sinigang mix", 1, "pack", "Canned & Packaged"),
      i("Kangkong", 1, "bundle", "Produce"),
      i("Sitaw", 1, "bundle", "Produce"),
      i("Labanos", 0.3, "kg", "Produce"),
      i("Talong", 0.3, "kg", "Produce"),
      i("Tomato", 0.2, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: [
      "Boil the pork with onion and tomato until tender, about 40 minutes.",
      "Add the sinigang mix, then the firmer vegetables.",
      "Add kangkong last and turn off the heat.",
    ],
  },
  {
    key: "sinigang-hipon",
    name: "Sinigang na hipon",
    slots: ["lunch", "dinner"],
    categories: ["seafood", "soup"],
    serves: 5,
    minutes: 35,
    ingredients: [
      i("Shrimp", 0.7, "kg", "Fish & Seafood"),
      i("Sinigang mix", 1, "pack", "Canned & Packaged"),
      i("Kangkong", 1, "bundle", "Produce"),
      i("Sitaw", 1, "bundle", "Produce"),
      i("Tomato", 0.2, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: ["Simmer onion and tomato.", "Add the mix and vegetables.", "Add shrimp last — three minutes is plenty."],
  },
  {
    key: "tinola",
    name: "Tinolang manok",
    slots: ["lunch", "dinner"],
    categories: ["chicken", "soup"],
    serves: 5,
    minutes: 45,
    ingredients: [
      i("Chicken whole", 1, "kg", "Meat"),
      i("Ginger", 0.05, "kg", "Produce"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
      i("Sayote", 0.5, "kg", "Produce"),
      i("Malunggay", 1, "bundle", "Produce"),
      i("Fish sauce", 0.2, "bottle", "Condiments & Spices"),
    ],
    steps: [
      "Sauté ginger, garlic and onion.",
      "Add the chicken and fish sauce, then water; simmer 25 minutes.",
      "Add sayote, then malunggay at the end.",
    ],
  },
  {
    key: "menudo",
    name: "Pork menudo",
    slots: ["lunch", "dinner"],
    categories: ["pork"],
    serves: 5,
    minutes: 55,
    ingredients: [
      i("Pork kasim", 0.8, "kg", "Meat"),
      i("Potato", 0.3, "kg", "Produce"),
      i("Carrots", 0.3, "kg", "Produce"),
      i("Tomato sauce", 1, "pack", "Canned & Packaged"),
      i("Bell pepper", 0.2, "kg", "Produce"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: ["Sauté garlic and onion, brown the pork.", "Add tomato sauce and simmer.", "Add potato, carrot, then bell pepper."],
  },
  {
    key: "afritada",
    name: "Chicken afritada",
    slots: ["lunch", "dinner"],
    categories: ["chicken"],
    serves: 5,
    minutes: 50,
    ingredients: [
      i("Chicken thigh", 1, "kg", "Meat"),
      i("Potato", 0.3, "kg", "Produce"),
      i("Carrots", 0.3, "kg", "Produce"),
      i("Tomato sauce", 1, "pack", "Canned & Packaged"),
      i("Bell pepper", 0.2, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: ["Brown the chicken.", "Add tomato sauce and water; simmer 25 minutes.", "Add the vegetables."],
  },
  {
    key: "caldereta",
    name: "Beef caldereta",
    slots: ["lunch", "dinner"],
    categories: ["beef"],
    serves: 5,
    minutes: 90,
    ingredients: [
      i("Beef brisket", 1, "kg", "Meat"),
      i("Caldereta mix", 1, "pack", "Canned & Packaged"),
      i("Potato", 0.3, "kg", "Produce"),
      i("Carrots", 0.3, "kg", "Produce"),
      i("Bell pepper", 0.2, "kg", "Produce"),
      i("Liver spread", 1, "can", "Canned & Packaged"),
    ],
    steps: ["Simmer the beef until tender, about an hour.", "Add the mix and liver spread.", "Add vegetables and finish."],
  },
  {
    key: "kare-kare",
    name: "Kare-kare",
    slots: ["lunch", "dinner"],
    categories: ["beef", "vegetables"],
    serves: 5,
    minutes: 90,
    ingredients: [
      i("Beef shank", 1, "kg", "Meat"),
      i("Kare-kare mix", 1, "pack", "Canned & Packaged"),
      i("Peanut butter", 0.3, "jar", "Condiments & Spices"),
      i("Sitaw", 1, "bundle", "Produce"),
      i("Talong", 0.3, "kg", "Produce"),
      i("Pechay", 1, "bundle", "Produce"),
      i("Bagoong", 1, "jar", "Condiments & Spices"),
    ],
    steps: ["Boil the shank until tender.", "Stir in the mix and peanut butter.", "Add vegetables. Serve with bagoong."],
  },
  {
    key: "nilaga",
    name: "Nilagang baka",
    slots: ["lunch", "dinner"],
    categories: ["beef", "soup"],
    serves: 5,
    minutes: 90,
    ingredients: [
      i("Beef shank", 1, "kg", "Meat"),
      i("Potato", 0.3, "kg", "Produce"),
      i("Repolyo", 0.5, "kg", "Produce"),
      i("Sitaw", 1, "bundle", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
      i("Black pepper", 1, "pack", "Condiments & Spices"),
    ],
    steps: ["Boil the beef with onion and pepper until tender.", "Add potato, then cabbage and beans."],
  },
  {
    key: "ginisang-monggo",
    name: "Ginisang monggo",
    slots: ["lunch", "dinner"],
    categories: ["vegetables", "pork"],
    serves: 5,
    minutes: 50,
    ingredients: [
      i("Monggo", 0.5, "kg", "Rice & Grains"),
      i("Pork belly", 0.3, "kg", "Meat"),
      i("Malunggay", 1, "bundle", "Produce"),
      i("Tomato", 0.2, "kg", "Produce"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: ["Boil the monggo until soft.", "Sauté garlic, onion, tomato and pork; combine.", "Add malunggay at the end."],
  },
  {
    key: "pinakbet",
    name: "Pinakbet",
    slots: ["lunch", "dinner"],
    categories: ["vegetables"],
    serves: 5,
    minutes: 40,
    ingredients: [
      i("Kalabasa", 0.4, "kg", "Produce"),
      i("Talong", 0.3, "kg", "Produce"),
      i("Okra", 1, "pack", "Produce"),
      i("Ampalaya", 0.3, "kg", "Produce"),
      i("Sitaw", 1, "bundle", "Produce"),
      i("Pork belly", 0.3, "kg", "Meat"),
      i("Bagoong", 1, "jar", "Condiments & Spices"),
    ],
    steps: ["Render the pork.", "Add bagoong and a little water.", "Layer the vegetables and steam, hardest first."],
  },
  {
    key: "bistek",
    name: "Bistek Tagalog",
    slots: ["lunch", "dinner"],
    categories: ["beef"],
    serves: 5,
    minutes: 50,
    ingredients: [
      i("Beef brisket", 0.8, "kg", "Meat"),
      i("Soy sauce", 0.4, "bottle", "Condiments & Spices"),
      i("Calamansi", 0.2, "kg", "Produce"),
      i("Onion", 0.3, "kg", "Produce"),
      i("Black pepper", 1, "pack", "Condiments & Spices"),
    ],
    steps: ["Marinate the beef in soy, calamansi and pepper.", "Sear, then simmer until tender.", "Top with onion rings."],
  },
  {
    key: "giniling",
    name: "Giniling guisado",
    slots: ["lunch", "dinner"],
    categories: ["pork"],
    serves: 5,
    minutes: 35,
    ingredients: [
      i("Ground pork", 0.7, "kg", "Meat"),
      i("Potato", 0.3, "kg", "Produce"),
      i("Carrots", 0.3, "kg", "Produce"),
      i("Tomato sauce", 1, "pack", "Canned & Packaged"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Onion", 0.1, "kg", "Produce"),
    ],
    steps: ["Sauté garlic and onion, brown the pork.", "Add tomato sauce and the vegetables.", "Simmer 20 minutes."],
  },
  {
    key: "pritong-isda",
    name: "Pritong bangus",
    slots: ["lunch", "dinner"],
    categories: ["seafood"],
    serves: 5,
    minutes: 25,
    ingredients: [
      i("Bangus", 1, "kg", "Fish & Seafood"),
      i("Cooking oil", 0.3, "L", "Condiments & Spices"),
      i("Salt", 1, "pack", "Condiments & Spices"),
      i("Calamansi", 0.1, "kg", "Produce"),
    ],
    steps: ["Salt the fish and rest 15 minutes.", "Fry until crisp on both sides.", "Serve with calamansi and soy."],
  },
  {
    key: "pancit-canton",
    name: "Pancit canton",
    slots: ["lunch", "dinner", "snack"],
    categories: ["noodles"],
    serves: 5,
    minutes: 35,
    ingredients: [
      i("Pancit canton", 2, "pack", "Rice & Grains"),
      i("Chicken breast", 0.3, "kg", "Meat"),
      i("Carrots", 0.2, "kg", "Produce"),
      i("Repolyo", 0.3, "kg", "Produce"),
      i("Baguio beans", 0.2, "kg", "Produce"),
      i("Soy sauce", 0.3, "bottle", "Condiments & Spices"),
      i("Oyster sauce", 0.3, "bottle", "Condiments & Spices"),
    ],
    steps: ["Sauté the chicken and vegetables.", "Add stock and sauces, bring to a boil.", "Add noodles and toss until absorbed."],
  },
  {
    key: "spaghetti",
    name: "Filipino spaghetti",
    slots: ["lunch", "dinner"],
    categories: ["noodles"],
    serves: 6,
    minutes: 45,
    ingredients: [
      i("Spaghetti pasta", 1, "pack", "Rice & Grains"),
      i("Ground pork", 0.5, "kg", "Meat"),
      i("Hotdog", 1, "pack", "Meat"),
      i("Tomato sauce", 2, "pack", "Canned & Packaged"),
      i("Banana ketchup", 0.5, "bottle", "Condiments & Spices"),
      i("Cheese", 1, "pack", "Dairy & Eggs"),
      i("Brown sugar", 0.1, "kg", "Condiments & Spices"),
    ],
    steps: ["Boil the pasta.", "Brown the pork and hotdogs.", "Add sauces and sugar; simmer. Top with cheese."],
  },
  {
    key: "tortang-talong",
    name: "Tortang talong",
    slots: ["breakfast", "lunch", "dinner"],
    categories: ["vegetables"],
    serves: 4,
    minutes: 30,
    ingredients: [
      i("Talong", 0.5, "kg", "Produce"),
      i("Eggs", 0.2, "tray", "Dairy & Eggs"),
      i("Ground pork", 0.2, "kg", "Meat"),
      i("Onion", 0.05, "kg", "Produce"),
      i("Cooking oil", 0.2, "L", "Condiments & Spices"),
    ],
    steps: ["Grill and peel the eggplant.", "Flatten, dip in beaten egg.", "Fry until set."],
  },
  {
    key: "tapsilog",
    name: "Tapsilog",
    slots: ["breakfast"],
    categories: ["rice", "beef"],
    serves: 4,
    minutes: 25,
    ingredients: [
      i("Tocino", 1, "pack", "Meat"),
      i("Eggs", 0.15, "tray", "Dairy & Eggs"),
      i("Rice", 0.5, "kg", "Rice & Grains"),
      i("Garlic", 0.05, "kg", "Produce"),
    ],
    steps: ["Fry the tapa or tocino.", "Make garlic rice from yesterday's rice.", "Fry the eggs sunny side up."],
  },
  {
    key: "longsilog",
    name: "Longsilog",
    slots: ["breakfast"],
    categories: ["rice", "pork"],
    serves: 4,
    minutes: 25,
    ingredients: [
      i("Longganisa", 1, "pack", "Meat"),
      i("Eggs", 0.15, "tray", "Dairy & Eggs"),
      i("Rice", 0.5, "kg", "Rice & Grains"),
      i("Garlic", 0.05, "kg", "Produce"),
    ],
    steps: ["Simmer then fry the longganisa.", "Garlic rice.", "Fried eggs."],
  },
  {
    key: "champorado",
    name: "Champorado",
    slots: ["breakfast", "snack"],
    categories: ["rice", "merienda"],
    serves: 5,
    minutes: 30,
    ingredients: [
      i("Malagkit", 0.4, "kg", "Rice & Grains"),
      i("Chocolate", 1, "pack", "Snacks"),
      i("Condensed milk", 1, "can", "Dairy & Eggs"),
      i("Sugar", 0.1, "kg", "Condiments & Spices"),
    ],
    steps: ["Boil the malagkit until soft.", "Stir in chocolate and sugar.", "Serve with milk."],
  },
  {
    key: "arroz-caldo",
    name: "Arroz caldo",
    slots: ["breakfast", "snack"],
    categories: ["rice", "chicken", "soup"],
    serves: 5,
    minutes: 50,
    ingredients: [
      i("Rice", 0.4, "kg", "Rice & Grains"),
      i("Chicken thigh", 0.5, "kg", "Meat"),
      i("Ginger", 0.05, "kg", "Produce"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Eggs", 0.15, "tray", "Dairy & Eggs"),
      i("Calamansi", 0.1, "kg", "Produce"),
      i("Fish sauce", 0.2, "bottle", "Condiments & Spices"),
    ],
    steps: ["Sauté ginger, garlic, chicken.", "Add rice and stock; simmer until thick.", "Serve with egg and calamansi."],
  },
  {
    key: "lugaw",
    name: "Lugaw",
    slots: ["breakfast", "snack"],
    categories: ["rice", "soup"],
    serves: 5,
    minutes: 40,
    ingredients: [
      i("Rice", 0.4, "kg", "Rice & Grains"),
      i("Ginger", 0.05, "kg", "Produce"),
      i("Garlic", 0.05, "kg", "Produce"),
      i("Fish sauce", 0.2, "bottle", "Condiments & Spices"),
    ],
    steps: ["Simmer rice with ginger until it breaks down.", "Season with fish sauce.", "Top with fried garlic."],
  },
  {
    key: "ginisang-sardinas",
    name: "Ginisang sardinas",
    slots: ["breakfast", "lunch"],
    categories: ["seafood"],
    serves: 4,
    minutes: 15,
    ingredients: [
      i("Sardines", 2, "can", "Canned & Packaged"),
      i("Onion", 0.05, "kg", "Produce"),
      i("Garlic", 0.03, "kg", "Produce"),
      i("Tomato", 0.1, "kg", "Produce"),
    ],
    steps: ["Sauté garlic, onion, tomato.", "Add the sardines with their sauce.", "Simmer five minutes."],
  },
  {
    key: "turon",
    name: "Turon",
    slots: ["snack"],
    categories: ["merienda"],
    serves: 6,
    minutes: 30,
    ingredients: [
      i("Banana", 1, "kg", "Produce"),
      i("Lumpia wrapper", 1, "pack", "Frozen"),
      i("Brown sugar", 0.2, "kg", "Condiments & Spices"),
      i("Cooking oil", 0.3, "L", "Condiments & Spices"),
    ],
    steps: ["Roll banana in sugar, wrap.", "Fry until the sugar caramelises.", "Drain and cool slightly."],
  },
  {
    key: "banana-cue",
    name: "Banana cue",
    slots: ["snack"],
    categories: ["merienda"],
    serves: 6,
    minutes: 25,
    ingredients: [
      i("Banana", 1, "kg", "Produce"),
      i("Brown sugar", 0.3, "kg", "Condiments & Spices"),
      i("Cooking oil", 0.3, "L", "Condiments & Spices"),
    ],
    steps: ["Fry the bananas.", "Add sugar and let it coat.", "Skewer and cool."],
  },
  {
    key: "ginataang-bilo",
    name: "Ginataang bilo-bilo",
    slots: ["snack"],
    categories: ["merienda"],
    serves: 6,
    minutes: 45,
    ingredients: [
      i("Malagkit", 0.3, "kg", "Rice & Grains"),
      i("Coconut milk", 2, "can", "Canned & Packaged"),
      i("Kalabasa", 0.3, "kg", "Produce"),
      i("Banana", 0.5, "kg", "Produce"),
      i("Sugar", 0.2, "kg", "Condiments & Spices"),
    ],
    steps: ["Form the rice balls.", "Simmer coconut milk with sugar.", "Add everything and cook until soft."],
  },
];

export const RECIPES_BY_KEY = new Map(RECIPES.map((r) => [r.key, r]));

export function recipesForSlot(slot: MealSlot): Recipe[] {
  return RECIPES.filter((r) => r.slots.includes(slot));
}
