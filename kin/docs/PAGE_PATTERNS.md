# Which header a new page uses

Three shapes exist in `src/components/hub-header.tsx` and nowhere is it
written down which one a new page should reach for. This is that decision.

## `HubHeader` — exactly the five tab roots

`/today`, `/journal`, `/household`, `/planner`, `/family`, `/wealth`. Each is
a numbered hub (`n="01"` through `n="05"`) with segmented sub-views under it
(Cash Flow / Accounts / A&L, say) and today's date in the household's own
format. Nothing else uses it, and nothing else should — a `HubHeader` on a
detail page would carry a segmented control that has nowhere to point.

## `DetailHeader` — everything reached by going *into* a hub

A back button plus one small eyebrow line (`"HUB 01 · MILESTONE"`). This is
every add/edit/detail screen under a hub: `journal/new`, `wealth/accounts/[id]`,
`family/members/[id]`, and so on — 26 pages as of this writing, all following
the same `backHref` + `eyebrow` shape. A new add/edit/detail page should use
this and nothing else; inventing a one-off header for a screen that is
structurally the same as the other 26 is exactly the kind of drift this file
exists to stop.

## Custom — only when the page is not really a hub screen at all

`/login`, `/signup`, `/settings` (which layers its own header on `DetailHeader`
for its back button but owns its own title block), the onboarding flow. These
sit outside the hub/detail structure entirely — there is no tab bar, no
segmented control, sometimes no session yet. Reach for a custom header only
when the page genuinely isn't a hub or a thing reached from one; a page that
merely *feels* special (an important detail page, a page with an unusual
action) is still a `DetailHeader`.

## Deciding, in one line

Is this one of the five tab roots? `HubHeader`. Is it reached by tapping into
one of those five? `DetailHeader`. Neither? Then, and only then, something
custom — and say in a comment why `DetailHeader` didn't fit.

## Breadcrumbs, for routes where "back" is not one clear place

Most detail pages are one hop from their hub (`journal/new`, `wealth/add`),
and `DetailHeader`'s eyebrow plus back button is enough context for that —
there is only one place "back" can mean. Three routes are not that simple:

- `family/documents/[folderId]/[entryId]/edit` — nested a level deeper: back
  from here means the folder, not the hub, and the folder's name was nowhere
  on screen.
- `family/members/[id]/health/new` — nested a level deeper: back means that
  member's health tab, not the family hub.
- `family/members/[id]` — not nested deeper, but reached from *two* different
  hubs: the Family list (the ordinary path), and Settings, which links
  straight to your own profile. A bare back button hardcoded to Family sent
  you to the wrong hub if you'd arrived from Settings; the page now reads a
  `from=settings` query param the Settings link sets, and both the back
  button and the crumb's first link follow it.

For those, `DetailHeader` takes an optional `trail` prop: a short list of
`{ label, href? }` crumbs rendered above the existing back/eyebrow row (the
last crumb has no `href` — it's where you are). It is opt-in and additive, so
the other 20-plus pages that pass one level of nesting from a single hub are
untouched. Reach for it when a page is nested past one level from its hub, or
when it can genuinely be reached from more than one place — at one level from
a single hub, the existing back button already says everything a crumb
would.

## On the CSS scales in `globals.css`

`--text-*` and `--space-*` (added alongside this file) are not retrofitted
across the app in one pass — that would itself be the kind of large,
hard-to-review diff `CLAUDE.md`'s watched-list exists to flag, for a change
with no visible effect. `src/components/collapsible-group.tsx` is the first
component migrated, and only where a token's value is pixel-identical to
what was already there — nothing was nudged to the nearest step. New code
should reach for a token; existing inline sizes get swept to match one only
as the file they're in is touched for some other reason.
