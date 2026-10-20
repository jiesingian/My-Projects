/** Kin AI, the part that is the same for every feature that calls Claude --
 * Ask Kin, the flyer scan, and whatever comes after them.
 *
 * One model, named once (Jonathan, 30 September and 20 October): Claude
 * Haiku 4.5. It costs a fraction of Opus per question and reads a photo or
 * answers a household question well enough; the prompts are written for it,
 * short and explicit. Haiku 4.5 takes no `effort` setting and no server-side
 * `fallbacks`, both of which the Opus calls had -- sending either is a 400,
 * so the request shape lives here too, built by one function, and a logic
 * spec holds it to that (e2e/kin-ai.logic.spec.ts).
 *
 * Nothing here talks to the network. The key check and the request shape are
 * pure, so they can be tested without a key, which is also how the app runs
 * until Jonathan adds one (docs/SETUP_FOR_JONATHAN.md, section 4). */

import type Anthropic from "@anthropic-ai/sdk";

/** The one model every Kin AI call uses. Change it here and nowhere else. */
export const KIN_AI_MODEL = "claude-haiku-4-5";

/** What every screen says while the key is not on the server. The feature
 * stays visible so a household knows it exists; nothing is sent anywhere. */
export const KIN_AI_OFF = "Kin AI isn't switched on yet. Jonathan switches it on once; nothing was sent anywhere.";

/** The one line under anything that sends family records to the model. */
export const KIN_AI_PRIVACY = "What you send goes to Claude (Anthropic) only to answer you, and is never used to train AI.";

/** Whether the server has a key. Read at call time, not import time, so a
 * key added to Vercel is seen by the next request without a rebuild. */
export function kinAiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

type Request = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** The request every Kin AI call starts from. Only what Haiku 4.5 accepts:
 * no `output_config.effort`, no `fallbacks`, no betas. A caller adds its
 * own `system`, `messages`, `tools` or `output_config.format`. */
export function kinAiRequest(params: Omit<Request, "model" | "max_tokens"> & { max_tokens?: number }): Request {
  const { max_tokens, ...rest } = params;
  return { ...rest, model: KIN_AI_MODEL, max_tokens: max_tokens ?? 4096 };
}

/** The text blocks of an answer, joined. Tool-use blocks are left out. */
export function textOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}
