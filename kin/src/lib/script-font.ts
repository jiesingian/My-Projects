import { Dancing_Script } from "next/font/google";

/** The household's surname on Today, in handwriting (Janine, 12 October:
 * "Lucida Handwriting"). Lucida Handwriting is a licensed Windows font --
 * no iPhone, Android phone or Mac has it, and Kin may not ship it -- so it
 * is asked for first and Dancing Script, the nearest free script, is what
 * everyone else sees. Only the weight used is loaded. */
export const scriptFont = Dancing_Script({ subsets: ["latin"], weight: "600", display: "swap", fallback: ["cursive"] });

export const scriptFamily = `"Lucida Handwriting", ${scriptFont.style.fontFamily}`;
