import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { CHAT_THEMES, chatTheme, householdTopic } from "@/lib/chat-themes";

/** A chat's theme is stored once per thread, under the thread's realtime
 * topic, so the database's chat_topic_is_mine() decides who may see and
 * change it. */

test("an unknown or missing theme is drawn as the default", () => {
  expect(chatTheme(null)).toBe("default");
  expect(chatTheme("nope")).toBe("default");
  expect(chatTheme("ocean")).toBe("ocean");
});

test("the household chat's topic is its live channel's name, and fits the table's check", () => {
  const topic = householdTopic("0b6a3c1e-8f7d-4b2a-9c1e-2d3f4a5b6c7d");
  expect(topic).toBe("family-chat:0b6a3c1e-8f7d-4b2a-9c1e-2d3f4a5b6c7d");
  expect(topic).toMatch(/^[a-z-]{1,32}:[0-9a-f-]{36}$/);
});

test("every theme id fits the table's check and has its look in globals.css", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  for (const t of CHAT_THEMES) {
    expect(t.id).toMatch(/^[a-z0-9-]{1,32}$/);
    if (t.id !== "default") expect(css).toContain(`[data-chat-theme="${t.id}"]`);
  }
});
