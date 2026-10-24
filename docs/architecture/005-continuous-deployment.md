# 005 — Continuous deployment

**Status**: accepted
**Date**: 2026-10-02

## Context

004 deployed the app by running `npm run deploy` from the developer's Windows machine. That builds
from whatever is in the working tree, including uncommitted edits and local-only files, and nothing
ties what is live to what is on `main`. The constitution deferred CI/CD until there was a concrete
need; a deployed app with a merged `main` is that need.

Local-only files turned out to matter more than expected. `@opennextjs/cloudflare` 1.20.7 reads
every `.env*` file at build time and writes their values into `.open-next/cloudflare/next-env.mjs`,
which the Worker imports, and there is no option to turn this off. The first deploy therefore
uploaded the local `SESSION_SECRET` and `GOOGLE_CLIENT_SECRET` inside the Worker script. The
Worker's own secrets take precedence at runtime, but the values stay in Cloudflare's version
history.

The repository is public, so whatever deploys it must hold a Cloudflare credential that no one but
the owner can reach or trigger.

## Decision

### Deploy on merge to `main` with one GitHub Actions workflow

`.github/workflows/deploy.yml` runs on every push to `main`, and on demand through
`workflow_dispatch`. One job, in order:

1. `npm ci` from the lockfile, with npm pinned to the version used locally so `allowScripts` behaves
   the same.
2. `scripts/check.ps1`. A red gate stops the deploy.
3. `wrangler d1 migrations apply onestopshop --remote`. It is a no-op when nothing is pending, and
   running it before the deploy means new code never meets an old schema.
4. `opennextjs-cloudflare build`, then `opennextjs-cloudflare deploy`, which updates the existing
   `onestopshop` Worker in place.
5. `wrangler deploy -c jobs/wrangler.jsonc`, which deploys the `onestopshop-jobs` Worker with the
   same token. Migrations already ran in step 3, so neither Worker meets a schema it doesn't expect.
   See [014](014-scheduled-jobs.md).

The build runs in a fresh checkout, where no `.env*` file exists, so nothing local reaches the
bundle.

### No local deploy path

The `deploy` npm script is removed, so deploying from a working copy is never one command away. If
the workflow is unavailable, the fallback is a fresh clone with no `.env*` files. `npm run preview`
stays: it builds the same way but runs the Worker locally and uploads nothing.

Keeping `.env.local` was preferred over removing it. Removing it would mean reading configuration
from the Cloudflare context instead of `process.env` and teaching the end-to-end tests to read
`.dev.vars`, which is more change than a rule that the workflow already enforces.

A `concurrency` group keeps two merges from deploying out of order. Playwright is not part of the
deploy: it needs `SESSION_SECRET` and a browser, and it belongs in a pull-request check if one is
ever added.

Cloudflare's own Git integration (Workers Builds) was rejected because the gate and the migration
step would live in the dashboard instead of the repository.

### Only the owner can deploy

- `CLOUDFLARE_API_TOKEN` is an **environment secret** of the `production` environment, whose only
  allowed deployment branch is `main`. A workflow on any other branch cannot read it. It is passed
  only to the two steps that call Cloudflare.
- The token is scoped to **Workers Scripts: Edit** and **D1: Edit** on this account only. The
  Worker's runtime secrets (`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`) stay on the Worker and never
  reach GitHub.
- The owner is the only collaborator, so only the owner can push to `main`, merge a pull request or
  run `workflow_dispatch`.
- The `Protect main` ruleset blocks force pushes and deletion of `main` and requires a pull request.
  It requires no approving review, because GitHub does not let an author approve their own pull
  request; repository admins may bypass it.
- Workflows on pull requests from outside collaborators wait for the owner's approval, and the
  workflow never uses `pull_request_target`.
- Actions are limited to GitHub-owned ones, pinned to a commit SHA, which the repository enforces.
  The default `GITHUB_TOKEN` is read-only, and the workflow declares `contents: read`.

## Consequences

- Merging to `main` is deploying. A change that is not ready to go live is not merged.
- Migrations reach production before the code that needs them, so a migration must be safe for the
  code currently live.
- These guarantees hold only while the owner is the sole writer. Adding a collaborator or a GitHub
  App with write access lets it deploy; at that point add a required reviewer to `production`.
- Bumping `actions/checkout` or `actions/setup-node` means replacing the pinned SHA, not a tag.
- The local secrets uploaded by the first deploy are made worthless by rotating them: a new Google
  client secret (set with `wrangler secret put` and in the local files, the old one deleted in
  Google Cloud) and a new local `SESSION_SECRET`.
- If the token leaks, revoke it in the Cloudflare dashboard and set a new one with
  `gh secret set CLOUDFLARE_API_TOKEN --env production`.
