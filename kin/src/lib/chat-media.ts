/** Stickers and GIFs in the chat (29 September).
 *
 * Both travel as an ordinary message whose whole body is a token --
 * "[sticker:hugs]" or "[gif:200x150:https://media.giphy.com/...]" -- rather
 * than as new columns. That keeps them working in every thread that stores a
 * message body (the household chat today, the linked-household and direct
 * threads being built alongside), with no migration to keep in step, and an
 * older copy of the app just shows the token as text.
 *
 * A token is only drawn as a picture when it is exactly one of these: a
 * sticker from the built-in set, or a GIF on GIPHY's own media host. A
 * message cannot point the thread at any other address, so nobody can make
 * everyone's phone load an image from a server of their choosing. */

export type Sticker = { id: string; emoji: string; caption: string; from: string; to: string };

/** The built-in set: a big emoji and a line, on a colour. No picture files,
 * nothing to license or download, and no key needed. */
export const STICKERS: Sticker[] = [
  { id: "love", emoji: "❤️", caption: "Love you", from: "#ff9a9e", to: "#f6416c" },
  { id: "hugs", emoji: "🤗", caption: "Hugs", from: "#ffd3a5", to: "#fd6585" },
  { id: "thanks", emoji: "🙏", caption: "Thank you", from: "#a1c4fd", to: "#6a85f1" },
  { id: "lol", emoji: "😂", caption: "LOL", from: "#fddb92", to: "#f7b733" },
  { id: "yay", emoji: "🎉", caption: "Yay!", from: "#f6d365", to: "#fda085" },
  { id: "congrats", emoji: "🥳", caption: "Congrats!", from: "#c471f5", to: "#fa71cd" },
  { id: "birthday", emoji: "🎂", caption: "Happy birthday", from: "#fbc2eb", to: "#a18cd1" },
  { id: "proud", emoji: "🌟", caption: "So proud", from: "#ffe259", to: "#ffa751" },
  { id: "gotthis", emoji: "💪", caption: "You got this", from: "#43e97b", to: "#1fa2a8" },
  { id: "morning", emoji: "☀️", caption: "Good morning", from: "#fceabb", to: "#f8b500" },
  { id: "night", emoji: "🌙", caption: "Good night", from: "#4b6cb7", to: "#182848" },
  { id: "dinner", emoji: "🍽️", caption: "Dinner's ready", from: "#f5af19", to: "#f12711" },
  { id: "onmyway", emoji: "🚗", caption: "On my way", from: "#56ccf2", to: "#2f80ed" },
  { id: "home", emoji: "🏠", caption: "Home safe", from: "#a8e063", to: "#56ab2f" },
  { id: "missyou", emoji: "🥺", caption: "Miss you", from: "#e0c3fc", to: "#8ec5fc" },
  { id: "oops", emoji: "🙈", caption: "Oops", from: "#ffecd2", to: "#fcb69f" },
  { id: "ok", emoji: "👌", caption: "OK!", from: "#84fab0", to: "#8fd3f4" },
  { id: "sleepy", emoji: "😴", caption: "Sleepy", from: "#cfd9df", to: "#8e9eab" },
];

const byId = new Map(STICKERS.map((s) => [s.id, s]));

export type Gif = { url: string; width: number; height: number };

export type ChatMedia = { kind: "sticker"; sticker: Sticker } | { kind: "gif"; gif: Gif };

/** GIPHY's media hosts, and nothing else. */
const GIPHY_MEDIA = /^https:\/\/(media\d?|i)\.giphy\.com\/[A-Za-z0-9/._-]+$/;

export function isGiphyMedia(url: string): boolean {
  return GIPHY_MEDIA.test(url);
}

export function stickerBody(id: string): string {
  return `[sticker:${id}]`;
}

export function gifBody(g: Gif): string {
  return `[gif:${Math.round(g.width)}x${Math.round(g.height)}:${g.url}]`;
}

/** The sticker or GIF a message is, or null when it is words. */
export function chatMedia(body: string): ChatMedia | null {
  const text = body.trim();
  const s = /^\[sticker:([a-z0-9-]{1,32})\]$/.exec(text);
  if (s) {
    const sticker = byId.get(s[1]);
    return sticker ? { kind: "sticker", sticker } : null;
  }
  const g = /^\[gif:(\d{1,4})x(\d{1,4}):(\S+)\]$/.exec(text);
  if (g && isGiphyMedia(g[3])) {
    const width = Number(g[1]), height = Number(g[2]);
    if (width > 0 && height > 0) return { kind: "gif", gif: { url: g[3], width, height } };
  }
  return null;
}

/** What a notification or a quote says instead of the token. */
export function mediaSummary(body: string): string | null {
  const m = chatMedia(body);
  if (!m) return null;
  return m.kind === "sticker" ? `Sent a sticker: ${m.sticker.emoji} ${m.sticker.caption}` : "Sent a GIF";
}

export type GifResult = { id: string; title: string; preview: Gif; send: Gif };

/** GIPHY's search and trending answers, cut down to what the picker needs.
 * Anything not on GIPHY's media host is dropped rather than trusted. */
export function parseGiphy(json: unknown): GifResult[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: GifResult[] = [];
  for (const item of data) {
    const images = (item as { images?: Record<string, { url?: string; width?: string; height?: string }> })?.images;
    const pick = (name: string): Gif | null => {
      const r = images?.[name];
      const url = r?.url?.split("?")[0] ?? "";
      const width = Number(r?.width), height = Number(r?.height);
      return isGiphyMedia(url) && width > 0 && height > 0 ? { url, width, height } : null;
    };
    const send = pick("fixed_width") ?? pick("downsized");
    const preview = pick("fixed_width_small") ?? send;
    const id = String((item as { id?: unknown }).id ?? "");
    if (send && preview && id) out.push({ id, title: String((item as { title?: unknown }).title ?? "GIF"), preview, send });
  }
  return out;
}
