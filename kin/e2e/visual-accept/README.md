# Accepted screenshot changes

One file per pull request, `<pull request number>.txt`, with one screen slug
per line (for example `today-simple-off`), exactly as the e2e failure prints
it. `e2e/visual.spec.ts` reads only the file named after the pull request
under test, so a file counts for its own pull request and no other. Once that
pull request merges, main's run makes its pictures the baseline and the file
is inert history. Delete old files whenever you like.

One file each rather than one shared list: two open pull requests appending
to the same list conflict, and automerge holds a conflicted pull request.
