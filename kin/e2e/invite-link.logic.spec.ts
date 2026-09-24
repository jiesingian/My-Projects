import { test, expect } from "@playwright/test";
import { normalizeInviteUrl, inviteHost } from "@/lib/invite-link";
import { parseOpenGraph, imageAddress } from "@/lib/chat";
import { isAllowedImageType } from "@/lib/link-preview";

/** An event's invitation link: what the form will keep, how the card names
 * where it goes, and the two rules that keep its thumbnail safe to show. */

test("a pasted link is kept as a web address, with https added when it was left off", () => {
  expect(normalizeInviteUrl("https://www.evite.com/event/abc123")).toEqual({ url: "https://www.evite.com/event/abc123", error: null });
  expect(normalizeInviteUrl("  evite.com/event/abc123  ").url).toBe("https://evite.com/event/abc123");
  expect(normalizeInviteUrl("http://example.com/party").url).toBe("http://example.com/party");
});

test("an empty box means no invitation, not an error", () => {
  expect(normalizeInviteUrl("")).toEqual({ url: null, error: null });
  expect(normalizeInviteUrl("   ")).toEqual({ url: null, error: null });
});

test("anything that would run, or isn't the web, is refused", () => {
  expect(normalizeInviteUrl("javascript:alert(1)").error).toBeTruthy();
  expect(normalizeInviteUrl("data:text/html,<script>1</script>").error).toBeTruthy();
  expect(normalizeInviteUrl("ftp://example.com/invite").error).toBeTruthy();
  // A login baked into the link, and a bare word that is no address at all.
  expect(normalizeInviteUrl("https://user:pass@example.com/").error).toBeTruthy();
  expect(normalizeInviteUrl("party").error).toBeTruthy();
});

test("a link too long to be real is refused rather than cut", () => {
  expect(normalizeInviteUrl(`https://example.com/${"a".repeat(2100)}`).error).toBeTruthy();
});

test("the card names the link's real host, without www", () => {
  expect(inviteHost("https://www.evite.com/event/abc")).toBe("evite.com");
  expect(inviteHost("https://facebook.com/events/1")).toBe("facebook.com");
  expect(inviteHost("not a url")).toBe("");
});

test("a page's image is read as an absolute address, resolved against the page", () => {
  const page = "https://invites.example.com/wedding/ana-and-ben";
  expect(imageAddress("https://cdn.example.com/cover.jpg", page)).toBe("https://cdn.example.com/cover.jpg");
  expect(imageAddress("/img/cover.jpg", page)).toBe("https://invites.example.com/img/cover.jpg");
  // Entities in the attribute are decoded before it is resolved.
  expect(imageAddress("https://cdn.example.com/c.jpg?w=600&amp;h=300", page)).toBe("https://cdn.example.com/c.jpg?w=600&h=300");
});

test("an image address that isn't the web is dropped", () => {
  const page = "https://example.com/";
  expect(imageAddress("javascript:alert(1)", page)).toBeNull();
  expect(imageAddress("data:image/png;base64,AAAA", page)).toBeNull();
  expect(imageAddress("file:///etc/passwd", page)).toBeNull();
  expect(imageAddress("", page)).toBeNull();
});

test("the preview carries the og:image, and falls back to twitter:image", () => {
  const og = parseOpenGraph(
    '<head><meta property="og:title" content="Ana &amp; Ben are getting married"><meta property="og:image" content="https://cdn.example.com/cover.jpg"></head>',
    "https://example.com/wedding",
  );
  expect(og?.title).toBe("Ana & Ben are getting married");
  expect(og?.image).toBe("https://cdn.example.com/cover.jpg");

  const tw = parseOpenGraph('<head><title>Lolo turns 80</title><meta name="twitter:image" content="/banner.png"></head>', "https://party.example.org/lolo");
  expect(tw?.image).toBe("https://party.example.org/banner.png");

  const none = parseOpenGraph("<head><title>Just a title</title></head>", "https://example.com/");
  expect(none?.image).toBeNull();
});

test("the thumbnail proxy passes on raster images only, never SVG", () => {
  expect(isAllowedImageType("image/jpeg")).toBe("image/jpeg");
  expect(isAllowedImageType("image/PNG; charset=binary")).toBe("image/png");
  expect(isAllowedImageType("image/webp")).toBe("image/webp");
  // SVG would run its scripts on Kin's own origin if opened directly.
  expect(isAllowedImageType("image/svg+xml")).toBeNull();
  expect(isAllowedImageType("text/html")).toBeNull();
  expect(isAllowedImageType(null)).toBeNull();
});
