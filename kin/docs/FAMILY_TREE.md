# The family tree: how it reads, and the decisions behind it

Written 30 September, after Jonathan's review of the first redesign (#393):
"the family tree is messy, the other households here are not even existing,
the color coding is very random." Each section answers one of his questions.
Where something is still a proposal, it says so.

## What is on the chart

- **One tile per person.** Parents above, children below, spouses side by
  side. Lines run down from the parents to a bar and down to each child
  (`lib/tree-chart.ts`).
- **Regions only for households that exist on Kin.** Yours is one soft box in
  the accent colour. A linked household gets a box in its own colour when it
  has confirmed a person on your tree as theirs (an accepted tree match). The
  first redesign invented households from surnames ("Arenas", "Singian"); it
  no longer does.
- **Whether someone is on Kin, at a glance:**
  - *In your household:* filled in your household's colour, or their photo.
  - *Linked:* filled in the linked household's colour, with a small badge.
  - *Name only:* no colour and a dashed ring. Nobody on Kin has confirmed
    them. Their panel says "Name only, not on Kin yet", and the organiser can
    send an invite from it.
- **Colour means one thing: where somebody is on Kin.** A legend under the
  chart says which colour is which household. Personal member colours are not
  used on the tree.
- **Close family first.** The tree opens on relatives up to the second degree
  (see below), and "Everyone" shows the rest.

## Co-parents, and unmarried couples with a child

"Add father", then "Add mother" never recorded the two as married, so the
chart used to split them into two households. Now two people who share a
child and have no spouse recorded are seated together, joined by a **dashed**
line ("Parents together, not recorded as married"). A recorded marriage is a
**solid** line. So an unmarried couple with a child looks like exactly that,
and nothing has to be recorded that isn't true.

## A child with a different partner

Children hang from the two parents they actually share. A parent who is
married to someone else has the child's other parent seated on their far
side, so the line is short: a father sits between his former partner and his
wife. That child is labelled "Half-brother" or "Half-sister".

## Second degree

Degrees are counted the way the Civil Code counts them:
- **1st degree:** parents and children.
- **2nd degree:** grandparents, grandchildren, brothers and sisters.
- **Through marriage:** these count as your spouse's own. So parents-in-law are
  the 1st degree, and brothers- and sisters-in-law the 2nd.

Aunts, uncles, nieces and nephews (3rd) and cousins (4th) are one tap away,
under "Everyone". This is how the big genealogy sites handle a big family:
- They open on a focus person with a few generations around them. FamilySearch
  and Ancestry both show about three or four generations.
- You re-centre on someone to go further, rather than drawing hundreds of
  people at once.

## Two relatives who each typed in the same people

Two households often have their own record of the same grandmother. Kin
handles this in three steps:

1. **Confirming one person** (built): household A offers a relative to linked
   household B, and B says who that is in its own tree. Nothing is shared
   until B accepts.
2. **Drawing the rest once** (built now): when A opens "Show their side", a
   relative in the same place on both trees with the same name is drawn once.
   "The same place" means the same relationship to the confirmed person, such
   as their father or spouse. Middle names and accents are ignored, and birth
   years that disagree keep them apart (`matchBranch` in `lib/tree-merge.ts`).
   This is for drawing only and changes nobody's records.
3. **Suggesting matches** (built 6 October): "Is this the same Stella?" at
   the top of the tree, for grown-ups, when a linked household's tree has
   someone with the same name (first and last word; case, accents and middle
   names ignored) and either the same full birth date or the same father's
   and mother's names. This is MyHeritage's *Smart Matches* and Geni's *Tree
   Matches*. Nothing is merged on its own, and one household's yes is not
   enough: "Same person" offers your person to them (step 1), or accepts
   their offer if they said yes first, so the match exists only once both
   households have confirmed. "Not the same" stops that pair being suggested
   to your household for good; the other household still answers for
   itself. A suggestion tells you only that their tree holds someone with a
   name and birth date or parents you had already typed in
   (`tree_match_suggestions`, 20261006120000).

When a name-only relative joins Kin, the organiser links their tile to the new
profile ("Is this someone in Kin?"), and it turns from dashed to filled.

## Linked households that are not on the tree

Recommendation: don't draw them on the tree. The tree is about how people are
related, and a linked household with no confirmed person has no place on it.
Instead the chart lists them under the legend ("Linked on Kin but not on this
tree yet"), and says how to place them: pick the relative you share, then
"Share with a linked household". Their own tree stays theirs to show. A
relative's page already shows what their household shares.

## Screening fake trees

What already stops a made-up tree from reaching anybody:
- A tree is visible only to its own household.
- A household can only offer a person to a household it is **linked** with,
  and linking needs both households to accept.
- An offer shares a name and a birth year, nothing else, and only once the
  other household accepts.
- A name on your tree never becomes somebody's account. A profile is attached
  only by a member of your own household, and only to a member of it.

Built 11 October (`20261011100000_tree_offer_limits_blocks_accounts.sql`):
- **A limit on offers:** at most 15 waiting on any one household, and 40 a
  day in all. Offering somebody already waiting is still fine at the limit.
- **Blocking:** a grown-up who has been offered a relative can block that
  household. What is waiting from them is declined, and they cannot offer
  again until it is undone, from the same screen. It stops offers *to* the
  blocking household only: the two stay linked, and the blocking household
  can still offer to theirs. The blocked household is told only that the
  other is "not taking relatives from you right now".
- **A conflict is said, not settled:** when a linked household records a
  different father or mother for somebody you share, the chart keeps yours
  and says so under the legend, with both names. A parent only one of you
  recorded is a gap, not a conflict. Either household can unlink the match.
- **Who has an account:** in a linked household's side, a relative with a Kin
  account there is filled in their colour, and one who is only a name in
  their tree has a dashed ring in it. That is a yes or no from
  `shared_branch_accounts`, only for a branch you have an accepted match with.

## Stories on the tree

Built 14 October (`20261014204000_tree_person_stories.sql`), after
FamilySearch's *Memories*: photos, documents and recorded interviews with
older relatives, kept on the person they are about.

- **Anyone on the tree can have stories**: a member, a relative who is only
  a name, somebody who has passed. "Stories" in their panel on the tree, and
  on a member's profile, opens `/family/stories/<person>`.
- **A story** is a title (this week's journal question is offered), who
  told it (a member, or words such as "Lolo Ben, told to Mia"), when it
  happened (a year is enough; "the 1960s", "May 1975" and "3 May 1975" are
  kept as exactly that, `lib/tree-stories.ts`), the words if it was written,
  and its files: recordings, old photos, scanned papers (PDF).
- **Recording** uses the chat's voice-note recorder with a twenty-minute
  limit, and writes the words down as it goes where the phone can (the
  browser's own speech recognition, as for voice notes; no key, nothing
  paid).
- **The files** are in Kin's storage, documents bucket, under
  `<household>/stories/`, so they count toward the household's allowance
  (1 GB on Kin Free, 50 GB on Plus). A file row cannot point anywhere else.
- **On the tile**, a small count opposite the linked badge (at most "9+").
- **Who sees them: the household only.** Not linked households, for now:
  the shared-branch read gives a linked household a name and a birth year,
  never anything a member wrote, and the files sit in the household's own
  folder. Sharing stories is its own decision, with its own switch.
- **Who writes them:** grown-ups, and teens with a login of their own (not
  in kid view). Whoever added a story may change or delete it; a grown-up
  may delete anyone's.
- **Kin Free**, like the tree and the journal. Storage is what is paid for.
- **Taking somebody off the tree** takes their stories and files with them
  (Manage people says how many first). A child cannot take off somebody
  who has stories.
