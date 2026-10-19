"use server";

import { lookup } from "node:dns/promises";
import { requireCurrentMember } from "@/lib/session";
import { extractRecipe, isPublicAddress, recipeLink, type RecipeDraft } from "@/lib/recipe-import";

/** Save a recipe from a link: fetch the page on the server and read the
 * recipe out of it (lib/recipe-import). Nothing is saved here -- the draft
 * fills the recipe editor, and Save there is the usual saveRecipeAction.
 *
 * The server fetches a URL a member typed, so it fetches only the public
 * internet: https, port 443, and every address the name resolves to (on each
 * redirect, followed by hand) must be public -- never this machine, a private
 * network or the cloud metadata address. At most 4 redirects, 8 seconds and
 * 3 MB; a recipe page is well under all three. */

const MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 4;

async function publicHost(url: URL): Promise<boolean> {
  try {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => isPublicAddress(a.address));
  } catch {
    return false;
  }
}

async function fetchPage(start: URL): Promise<{ html: string; url: URL } | { error: string }> {
  let url = start;
  const signal = AbortSignal.timeout(8000);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await publicHost(url))) return { error: "Kin can't open that link." };
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; KinRecipeReader/1.0)", accept: "text/html,application/xhtml+xml" },
        cache: "no-store",
      });
    } catch {
      return { error: "That page didn't answer. Check the link, or try again in a moment." };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      // A Location that isn't a URL at all throws in new URL(); that is a
      // link Kin can't follow, not a crash.
      let moved: URL | null = null;
      try {
        moved = next ? recipeLink(new URL(next, url).toString()) : null;
      } catch {
        moved = null;
      }
      if (!moved) return { error: "That link goes somewhere Kin can't follow." };
      url = moved;
      continue;
    }
    if (!res.ok) return { error: res.status === 404 ? "That page isn't there any more." : "That site wouldn't let Kin read the page." };
    if (!/html/i.test(res.headers.get("content-type") ?? "")) return { error: "That link isn't a web page with a recipe on it." };
    const reader = res.body?.getReader();
    if (!reader) return { error: "That page came back empty." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    // The 8-second timeout covers the body too; when it fires mid-page the
    // read throws, which is the same "didn't answer" as a failed fetch.
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    } catch {
      return { error: "That page didn't answer. Check the link, or try again in a moment." };
    }
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url };
  }
  return { error: "That link redirects too many times." };
}

export async function readRecipeFromLinkAction(input: string): Promise<{ error: string | null; draft?: RecipeDraft }> {
  await requireCurrentMember();
  const url = recipeLink(input);
  if (!url) return { error: "Paste the recipe's web address, starting https://" };
  const page = await fetchPage(url);
  if ("error" in page) return { error: page.error };
  const draft = extractRecipe(page.html, page.url.toString());
  if (!draft) return { error: "Kin couldn't find a recipe on that page. Write it in instead." };
  return { error: null, draft };
}
