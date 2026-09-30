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
3. **Suggesting matches** (proposal): "Is this the same Stella?" with one tap
   to confirm, creating the same kind of accepted match as step 1. This is
   MyHeritage's *Smart Matches* and Geni's *Tree Matches*. It needs a small
   database function; not built yet.

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

Proposals, not built:
- Rate-limit offers.
- Let a household decline an offer and block that household from offering
  again.
- Flag a conflict when two linked households record different parents for
  the same confirmed person, and show both until one withdraws.
