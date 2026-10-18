---
name: 'check'
description: 'Run OneStopShop quality gate - Prettier, ESLint, tsc and Vitest - through the scripts in scripts/, and interpret their switches, output and exit codes. Use before finishing any code change, or when asked to lint, format, typecheck or run the checks.'
argument-hint: 'Optional: fix'
user-invocable: true
disable-model-invocation: false
---

# The quality gate

    pwsh -NoProfile -File scripts/check.ps1        # format + lint + typecheck + unit tests
    pwsh -NoProfile -File scripts/check.ps1 -Fix   # fix what can be fixed, then report

**Every code change finishes with `check.ps1` exiting 0.**

The individual stages exist for narrower runs:

    pwsh -NoProfile -File scripts/format.ps1 -Write
    pwsh -NoProfile -File scripts/lint.ps1
    pwsh -NoProfile -File scripts/typecheck.ps1
    pwsh -NoProfile -File scripts/test.ps1
    pwsh -NoProfile -File scripts/e2e.ps1          # not part of check.ps1
    pwsh -NoProfile -File scripts/bundle.ps1       # not part of check.ps1: Worker size and startup

Prefer these over calling the tools directly. They print a one-line summary plus one line per
problem instead of raw tool output, which is why they exist: an agent reads a short result rather
than loading whole configs and stack traces into context.

## What is installed

| Tool                   | Purpose                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| Prettier               | All formatting; ESLint never fights it (`eslint-config-prettier` runs last) |
| ESLint 9 (flat config) | Correctness and convention rules, including the `docs/01` rules             |
| TypeScript             | Type checking via `tsc --noEmit`; the app is never built by these scripts   |
| Vitest                 | Unit tests (node and jsdom projects) and storage tests against local D1     |
| Playwright             | End-to-end tests in mobile WebKit against a real dev server                 |

Configuration lives in `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`,
`tsconfig.json`, `vitest.config.mts` and `playwright.config.ts`.

ESLint is pinned to the 9.x line because `eslint-plugin-jsx-a11y` does not yet support ESLint 10.

## Switches

| Switch           | Effect                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| `-Json`          | Emit one compact JSON object instead of text                             |
| `-MaxIssues <n>` | Cap how many problems are listed (default 50)                            |
| `-Help`          | Usage text, no work performed                                            |
| `-Fix`           | `lint.ps1` and `check.ps1`: apply auto-fixable fixes first                |
| `-Write`         | `format.ps1`: rewrite unformatted files instead of listing them          |
| `-Path <paths>`  | `lint.ps1`, `format.ps1`, `test.ps1`, `e2e.ps1`: restrict to given paths |

## Exit codes

Branch on the exit code rather than parsing the text.

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 0    | Passed, or skipped because there is nothing to check yet       |
| 1    | The check ran and found issues                                 |
| 2    | The check could not run (missing toolchain, unreadable output) |

`check.ps1` reports the worst code of its stages.

## Output shape

    FORMAT: PASS  unformatted=0
    LINT: FAIL  errors=2 warnings=0 files=1
      src/app/page.tsx:2:15 error react/forbid-dom-props Prop "style" is forbidden on DOM Nodes
      src/app/page.tsx:2:40 error react/jsx-no-literals Strings not allowed in JSX files: "Hello"
    TYPECHECK: PASS  errors=0
    TEST: PASS  tests=1 passed=1 failed=0

`SKIP` comes from `typecheck.ps1` when the repository contains no TypeScript at all, from
`test.ps1` when no test file matches, and from `e2e.ps1` when no spec file matches. `test.ps1`
reports `ERROR` with exit 2, never `SKIP`, when Vitest exits non-zero without running any test.

The test stage includes the `storage` project, which starts a local D1 and takes about 30 s, far
longer than the other stages. To iterate on one file, use
`npx vitest run --project storage <path>` rather than the whole gate, and run the gate before
finishing. Two Vitest runs must not overlap: the storage setup wipes `.wrangler/test-state` at the
start of every run. Stop a dev server running on port 3000 before running the gate. It makes storage
tests fail intermittently. The `test` skill has the command, under "Stop the dev server first".

## Which to run when

- After editing any source file: `check.ps1`.
- After a change that is purely formatting-shaped: `format.ps1 -Write`.
- Before concluding a task: `check.ps1` must exit 0.
- End-to-end tests are deliberately outside `check.ps1` - they need a browser and an HTTP server.
  Run `e2e.ps1` when routing, rendering or navigation changed. See the `test` skill.

## npm equivalents

`npm run lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:watch` and `e2e`
invoke the same tools with raw output. They exist for editor integration and CI. Prefer the
PowerShell scripts when working in a session, for the reason above.

## Requirements

Node.js 22.12 or newer, npm, and PowerShell 7 (`pwsh`). Windows PowerShell 5.1 is not supported by
these scripts. Run `npm install` before the first use, and `npm run e2e:install` before the first
end-to-end run; every script reports `ERROR ... run 'npm install' first` rather than failing
obscurely when dependencies are missing.
