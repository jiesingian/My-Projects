import { test, expect } from "@playwright/test";
import { REACTIONS, isReaction } from "@/lib/chat";

/** What may be sent back to a message without words.
 *
 * reactToMessageAction took its emoji as a plain string and wrote it through,
 * and family_message_reactions.emoji has no CHECK behind it, so nothing
 * anywhere had an opinion. Measured on 9 September against the throwaway
 * households: a whole sentence was accepted as a reaction, and so were five
 * thousand characters -- which then render in the chip under that message,
 * on the thread, for everybody in the household.
 *
 * The same shape as the currency bug found in Settings the same day: one
 * public endpoint, no validation, and the result stored where the whole
 * household has to look at it.
 */

test("the six the composer offers are accepted", () => {
  expect(REACTIONS.length, "six, as the picker renders").toBe(6);
  for (const r of REACTIONS) expect(isReaction(r), r).toBe(true);
});

test("a sentence is not a reaction", () => {
  expect(isReaction("not an emoji at all")).toBe(false);
  expect(isReaction("")).toBe(false);
});

test("nor is five thousand characters, which is what was actually stored", () => {
  expect(isReaction("X".repeat(5000))).toBe(false);
});

test("nor an emoji we simply do not offer", () => {
  // Refused because it is not on the list, not because it is not an emoji --
  // the check is membership, which is the only kind that cannot be argued
  // with by a caller who knows more Unicode than we do.
  expect(isReaction("🎉")).toBe(false);
  expect(isReaction("👍🏽"), "a skin-tone variant is a different string").toBe(false);
});

test("every reaction the picker renders is one the server accepts", () => {
  // The point of the shared list: the picker is built from it, so a reaction
  // somebody can actually tap can never come back refused.
  for (const r of REACTIONS) expect(isReaction(r)).toBe(true);
  expect(new Set(REACTIONS).size, "and none of them is listed twice").toBe(REACTIONS.length);
});

/** Turning a message into shopping-list items. The rule being tested is that
 * it splits on what people actually type in a list and does nothing cleverer
 * -- a list somebody shops from is the wrong place to guess. */
test.describe("splitShoppingItems", () => {
  test("a sentence with commas and a closing 'and'", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("We need milk, eggs and bread")).toEqual(["milk", "eggs", "bread"]);
  });
  test("a pasted list keeps its items and loses its bullets and numbers", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("- rice\n• soy sauce\n3. calamansi\n4) dish soap")).toEqual(["rice", "soy sauce", "calamansi", "dish soap"]);
  });
  test("the lead-in and the trailing 'pls' are instructions, not items", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("Can someone buy toothpaste pls")).toEqual(["toothpaste"]);
    expect(splitShoppingItems("out of: coffee; sugar!")).toEqual(["coffee", "sugar"]);
  });
  test("a quantity stays part of its item rather than being guessed at", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("2 dozen eggs, 1kg chicken")).toEqual(["2 dozen eggs", "1kg chicken"]);
  });
  test("the same thing twice is one thing", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("milk, Milk, eggs")).toEqual(["milk", "eggs"]);
  });
  test("an empty message, or only punctuation, is no items", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems("")).toEqual([]);
    expect(splitShoppingItems(" , ; \n ")).toEqual([]);
  });
  test("a very long list stops at twenty", async () => {
    const { splitShoppingItems } = await import("@/lib/chat");
    expect(splitShoppingItems(Array.from({ length: 40 }, (_, i) => `item ${i}`).join(", "))).toHaveLength(20);
  });
});

/** Pulling an amount out of a message to start an expense with. It must only
 * ever find money, never merely a number. */
test.describe("amountIn", () => {
  test("a peso amount with a thousands separator", async () => {
    const { amountIn } = await import("@/lib/chat");
    expect(amountIn("Paid the plumber ₱1,500")).toBe(1500);
    expect(amountIn("PHP 2,350.50 for the groceries")).toBe(2350.5);
    expect(amountIn("P850 for gas")).toBe(850);
  });
  test("dollars too", async () => {
    const { amountIn } = await import("@/lib/chat");
    expect(amountIn("Netflix went up to $15.49")).toBe(15.49);
  });
  test("a bare number is not money", async () => {
    const { amountIn } = await import("@/lib/chat");
    expect(amountIn("pick up 2 kids at 4")).toBeNull();
    expect(amountIn("room 1500")).toBeNull();
  });
  test("a word starting with p is not a peso sign", async () => {
    const { amountIn } = await import("@/lib/chat");
    expect(amountIn("park at level 3")).toBeNull();
    expect(amountIn("pp 20")).toBeNull();
  });
  test("zero is not an amount worth pre-filling", async () => {
    const { amountIn } = await import("@/lib/chat");
    expect(amountIn("₱0")).toBeNull();
  });
});

test.describe("firstUrl", () => {
  test("finds the link and leaves the sentence's punctuation behind", async () => {
    const { firstUrl } = await import("@/lib/chat");
    expect(firstUrl("Look at this (https://example.com/recipe?id=4).")).toBe("https://example.com/recipe?id=4");
  });
  test("only http and https", async () => {
    const { firstUrl } = await import("@/lib/chat");
    expect(firstUrl("javascript:alert(1)")).toBeNull();
    expect(firstUrl("file:///etc/passwd")).toBeNull();
    expect(firstUrl("no link here")).toBeNull();
  });
});

test.describe("parseOpenGraph", () => {
  test("Open Graph first, whichever order the attributes come in", async () => {
    const { parseOpenGraph } = await import("@/lib/chat");
    const p = parseOpenGraph(
      `<meta property="og:title" content="Chicken Adobo"><meta content="Braised in vinegar &amp; soy" property="og:description"><meta property="og:site_name" content="Panlasang Pinoy">`,
      "https://www.panlasangpinoy.com/adobo",
    );
    expect(p).toEqual({ url: "https://www.panlasangpinoy.com/adobo", site: "Panlasang Pinoy", title: "Chicken Adobo", description: "Braised in vinegar & soy", image: null });
  });
  test("falls back to <title> and the host", async () => {
    const { parseOpenGraph } = await import("@/lib/chat");
    expect(parseOpenGraph("<title>  School calendar 2026  </title>", "https://www.school.edu.ph/cal")).toEqual({
      url: "https://www.school.edu.ph/cal", site: "school.edu.ph", title: "School calendar 2026", description: null, image: null,
    });
  });
  test("markup inside a title comes back as text, never as markup", async () => {
    const { parseOpenGraph } = await import("@/lib/chat");
    const p = parseOpenGraph(`<title>Hi <img src=x onerror=alert(1)> there &lt;b&gt;</title>`, "https://x.test/");
    expect(p?.title).toBe("Hi there <b>");
    expect(p?.title).not.toContain("onerror");
  });
  test("a page with no title is no preview", async () => {
    const { parseOpenGraph } = await import("@/lib/chat");
    expect(parseOpenGraph("<html><body>hello</body></html>", "https://x.test/")).toBeNull();
  });
});

/** The check that stands between a message and our server fetching anything a
 * member types. Each case below is an address a server-side fetch is commonly
 * tricked into reading. */
test.describe("isPublicAddress", () => {
  test("ordinary public addresses pass", async () => {
    const { isPublicAddress } = await import("@/lib/chat");
    for (const a of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) expect(isPublicAddress(a), a).toBe(true);
  });
  test("this machine, private networks and the metadata service do not", async () => {
    const { isPublicAddress } = await import("@/lib/chat");
    for (const a of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255"])
      expect(isPublicAddress(a), a).toBe(false);
  });
  test("nor their IPv6 equivalents, including IPv4 dressed as IPv6", async () => {
    const { isPublicAddress } = await import("@/lib/chat");
    for (const a of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "64:ff9b::10.0.0.1", "2001:db8::1", "[::1]"])
      expect(isPublicAddress(a), a).toBe(false);
  });
  test("an IPv4 dressed as IPv6 is judged by the IPv4 inside it", async () => {
    const { isPublicAddress } = await import("@/lib/chat");
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });
  test("things that are not addresses are not public", async () => {
    const { isPublicAddress } = await import("@/lib/chat");
    for (const a of ["", "localhost", "999.1.1.1", "1.2.3"]) expect(isPublicAddress(a), a).toBe(false);
  });
});
