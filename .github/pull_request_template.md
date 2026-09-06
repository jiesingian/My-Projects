## What this changes

<!-- Plainly, in a sentence or two. What is different for someone using Kin? -->

## Why

<!-- The problem it solves. If it came from using the app and hitting something,
     say what happened. -->

## Anything you were unsure about

<!-- Decisions you made that could reasonably have gone the other way, and
     anything you could not test. This is the useful part — it is where the
     review actually happens. -->

## Checked before opening

- [ ] `npm run build` passes in `kin/`
- [ ] `npx tsc --noEmit` is clean
- [ ] `npm run lint` is clean
- [ ] If the database changed, the migration is applied and the change is safe
      to run against live family data
