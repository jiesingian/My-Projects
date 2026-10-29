/** Kin AI, the part that is the same for every feature that calls Claude --
 * Ask Kin, the flyer scan, and whatever comes after them.
 *
 * One model, named once (Jonathan, 30 September, 20 and 21 October): Claude
 * Haiku 5.5. It costs a tenth of Haiku 4.5 per word and reads a photo or
 * answers a household question well; the prompts are written for it, short
 * and explicit. Haiku 5.5 thinks by default (adaptive) and takes `effort`
 * (default `medium`); Kin sends `low`, the cheapest level, which is right for
 * short questions and scans. It rejects `budget_tokens`, `temperature`/
 * `top_p`/`top_k`, an assistant prefill and the server-side `fallbacks`
 * parameter (a refusal stays a refusal; each caller checks `stop_reason`).
 * Thinking counts toward `max_tokens`, so no call goes below
 * KIN_AI_MIN_TOKENS. The request shape lives here, built by one function,
 * and a logic spec holds it to that (e2e/kin-ai.logic.spec.ts).
 *
 * Nothing here talks to the network. The key check and the request shape are
 * pure, so they can be tested without a key, which is also how the app runs
 * until Jonathan adds one (docs/SETUP_FOR_JONATHAN.md, section 4). */

import type Anthropic from "@anthropic-ai/sdk";

/** The one model every Kin AI call uses. Change it here and nowhere else. */
export const KIN_AI_MODEL = "claude-haiku-5-5";

/** How hard Haiku 5.5 thinks before answering. `low` is the cheapest level;
 * a caller may ask for more by setting `output_config.effort` itself. */
export const KIN_AI_EFFORT = "low" as const;

/** Thinking uses part of `max_tokens`; below this a short answer can be cut
 * off after the thinking and before any text (stop_reason "max_tokens"). */
export const KIN_AI_MIN_TOKENS = 2048;

/** What every screen says while the key is not on the server. The feature
 * stays visible so a household knows it exists; nothing is sent anywhere. */
export const KIN_AI_OFF = "Kin AI isn't switched on yet. Nothing was sent anywhere.";

/** The one line under anything that sends family records to the model. */
export const KIN_AI_PRIVACY = "What you send goes to Claude (Anthropic) only to answer you; Anthropic does not train on it.";

/** What every Kin AI feature answers until this person has said yes
 * (20261030131701_kin_ai_ok.sql). A screen that knows it shows the Allow card
 * (components/kin-ai-ask.tsx); any other shows this sentence, which says
 * where to say yes. */
export const KIN_AI_ASK = "Kin AI needs your OK first. Allow it here or in Settings → Privacy.";

/** Whether the server has a key. Read at call time, not import time, so a
 * key added to Vercel is seen by the next request without a rebuild. */
export function kinAiReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

type Request = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/** The request every Kin AI call starts from. Only what Haiku 5.5 accepts:
 * `output_config.effort` (low unless the caller says otherwise), thinking
 * left at its default, no sampling settings, no `fallbacks`, no betas. A
 * caller adds its own `system`, `messages`, `tools` or `output_config.format`. */
export function kinAiRequest(params: Omit<Request, "model" | "max_tokens"> & { max_tokens?: number }): Request {
  const { max_tokens, output_config, ...rest } = params;
  return {
    ...rest,
    model: KIN_AI_MODEL,
    max_tokens: Math.max(max_tokens ?? 4096, KIN_AI_MIN_TOKENS),
    output_config: { effort: KIN_AI_EFFORT, ...output_config },
  };
}

/** The text blocks of an answer, joined. Tool-use blocks are left out. */
export function textOf(content: ReadonlyArray<{ type: string; text?: string }>): string {
  return content
    .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();
}
