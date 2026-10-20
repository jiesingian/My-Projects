/** The words of the pushes the app itself sends (not the five-minute tick):
 * built here, once, so the real sender and "Send me a test" (Settings ->
 * Notifications, 20261020190000) say the same thing. Each returns what the
 * sender puts in the payload: title, body, the deep link, the tag, and the
 * flags that shape delivery. Nothing here sends; lib/push.ts does. */

export type PushWords = {
  title: string;
  body: string;
  url: string;
  tag: string;
  /** Sent as urgent and kept on screen, like an SOS. */
  urgent?: boolean;
  /** The sender's photo, shown as the notification's picture. */
  icon?: string | null;
};

/** "Ann added a story about Lola" to the household, "Ann shared a story
 * about Lola" to a linked household, each opened at their own Lola. */
export function treeStoryWords(story: { id: string; personId: string; ours: boolean; title: string; writerFirst: string; personFirst: string }): PushWords {
  return {
    title: `${story.writerFirst} ${story.ours ? "added" : "shared"} a story about ${story.personFirst}`.slice(0, 80),
    body: story.title.slice(0, 180),
    url: `/family/stories/${story.personId}`,
    tag: `tree-story:${story.id}`,
  };
}

/** "Added to the list: Itlog · by Ann", to the household's helpers. */
export function helperListWords(item: { familyId: string; name: string; by: string }): PushWords {
  return {
    title: "Added to the list",
    body: `${item.name} · by ${item.by}`.slice(0, 180),
    url: `/helper?h=${item.familyId}`,
    tag: `helper-list-${item.familyId}`,
  };
}

/** "Nakarating na ako": the check-in's own title and body (lib/arrived.ts
 * arrivedMessage), sent as an arrival, opened at the household chat. */
export function arrivedWords(message: { title: string; body: string }, memberId: string): PushWords {
  return { title: message.title, body: message.body, url: "/chat/household", tag: `arrived-${memberId}` };
}

/** "SOS from Ann": urgent, with her photo, opened at the SOS screen. */
export function sosWords(sos: { id: string; first: string; where: boolean; icon: string | null }): PushWords {
  return {
    title: `SOS from ${sos.first}`,
    body: sos.where ? `${sos.first} needs help now. Tap for where they are and to call.` : `${sos.first} needs help now. Their phone didn't share a location. Tap to call.`,
    url: `/today/sos/${sos.id}`,
    tag: `sos-${sos.id}`,
    urgent: true,
    icon: sos.icon,
  };
}

/** The payload as the service worker reads it, from the words. */
export function pushPayload(w: PushWords): string {
  return JSON.stringify({
    title: w.title.slice(0, 80),
    body: w.body.slice(0, 180),
    url: w.url.startsWith("/") ? w.url : "/today",
    tag: w.tag,
    urgent: w.urgent || undefined,
    icon: w.icon && /^(https:\/\/|\/[^/])/.test(w.icon) ? w.icon : undefined,
  });
}
