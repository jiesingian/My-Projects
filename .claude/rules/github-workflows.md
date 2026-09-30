---
paths:
  - ".github/**"
---

# Workflow files

- Every change here is WATCHED: add the `WATCHED:` line to the commit.
- A new workflow that posts checks on PRs must be added to `automerge.yml`'s `workflow_run` list, or its completion never triggers a merge.
- Keep the long explanatory comments; they are how the next failure gets recognised.
- Actions minutes are free only while the repo is public; mind job length.
