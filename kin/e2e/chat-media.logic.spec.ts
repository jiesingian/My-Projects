import { test, expect } from "@playwright/test";
import { STICKERS, chatMedia, gifBody, mediaSummary, parseGiphy, stickerBody } from "@/lib/chat-media";

/** Stickers and GIFs travel as a message whose whole body is a token. Only a
 * token naming a built-in sticker, or a GIF on GIPHY's own media host, is
 * drawn as a picture -- nothing else can make every phone in the house load
 * an image from somewhere of the sender's choosing. */

test("every built-in sticker survives the round trip", () => {
  expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
  for (const s of STICKERS) expect(chatMedia(stickerBody(s.id))).toEqual({ kind: "sticker", sticker: s });
});

test("an unknown sticker, or a sticker inside a sentence, is just words", () => {
  expect(chatMedia("[sticker:nope]")).toBeNull();
  expect(chatMedia("look [sticker:love]")).toBeNull();
  expect(chatMedia("hello")).toBeNull();
});

test("a GIF is drawn only from GIPHY's media host", () => {
  const url = "https://media2.giphy.com/media/abc123/200w.gif";
  expect(chatMedia(gifBody({ url, width: 200, height: 150 }))).toEqual({ kind: "gif", gif: { url, width: 200, height: 150 } });
  expect(chatMedia("[gif:200x150:https://evil.example/track.gif]")).toBeNull();
  expect(chatMedia("[gif:200x150:https://media.giphy.com.evil.example/x.gif]")).toBeNull();
  expect(chatMedia("[gif:200x150:http://media.giphy.com/media/x/200w.gif]")).toBeNull();
  expect(chatMedia("[gif:0x150:https://media.giphy.com/media/x/200w.gif]")).toBeNull();
});

test("notifications and quotes say what was sent, not the token", () => {
  expect(mediaSummary(stickerBody("love"))).toBe("Sent a sticker: ❤️ Love you");
  expect(mediaSummary(gifBody({ url: "https://i.giphy.com/media/x/200w.gif", width: 1, height: 1 }))).toBe("Sent a GIF");
  expect(mediaSummary("plain words")).toBeNull();
});

test("GIPHY's answer is cut down to safe renditions, query strings dropped", () => {
  const json = {
    data: [
      {
        id: "a1",
        title: "Happy dance",
        images: {
          fixed_width: { url: "https://media3.giphy.com/media/a1/200w.gif?cid=x&rid=200w.gif", width: "200", height: "112" },
          fixed_width_small: { url: "https://media3.giphy.com/media/a1/100w.gif?cid=x", width: "100", height: "56" },
        },
      },
      { id: "bad", title: "Elsewhere", images: { fixed_width: { url: "https://evil.example/x.gif", width: "200", height: "200" } } },
      { id: "", images: {} },
    ],
  };
  const r = parseGiphy(json);
  expect(r).toHaveLength(1);
  expect(r[0].send).toEqual({ url: "https://media3.giphy.com/media/a1/200w.gif", width: 200, height: 112 });
  expect(r[0].preview.width).toBe(100);
  expect(parseGiphy(null)).toEqual([]);
  expect(parseGiphy({ data: "nope" })).toEqual([]);
});
