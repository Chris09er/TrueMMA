# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code
(this project runs SDK 54 — check `package.json`'s `expo` version before trusting this number).

## Two docs, both living — update them with the change, not afterwards

Neither is a cleanup task for "later". If a change makes either one wrong, it is part of that
change to fix it, in the same commit.

**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the handbook.** Data model, sync design,
notifications, build setup, migrations, and the running record of quirks, hard-won lessons and
open items. This is the source of truth and the place for detail, reasoning and gotchas.

**[docs/ecosystem-overview.html](docs/ecosystem-overview.html) — the map.** A visual orientation
page: which service plays which role, the five paths data travels, environments, cost/limits, and
known gaps. Written for someone returning after weeks away, so it stays deliberately shallow.

Update the overview whenever a change touches any of:

- a service being added, removed or swapped (the eight components)
- how data flows — a new trigger, a moved scheduler, a changed delivery path
- the branch/environment pipeline or the deploy mechanics
- cost or a quota/limit, including the measured numbers in that table
- an item in "Bekannte Lücken" being opened, closed, or changing severity

Routine code changes that don't alter any of the above leave the overview alone — it is a map,
so it should change when the terrain does, not on every commit. When in doubt, ask whether
someone returning after a month would be misled; if yes, update it.

The overview is published as an Artifact. Its URL is recorded in a comment at the top of the
file — pass that URL when republishing, or a second page is created at a new address instead of
updating the existing one. The file intentionally has no `<!doctype>`/`<html>` wrapper; see that
same comment.
