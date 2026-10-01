# 001 — Application Foundation

Status: accepted. Date: 2026-09-09.

Cross-cutting decisions made while bootstrapping the application. Feature-scoped decisions belong
in that feature's Spec Kit documents under `specs/`, not here.

## Web app / PWA rather than a native iOS app

The app is installed to the iPhone Home Screen as a PWA. A native app would require an Apple
Developer account and its annual fee for a single-user personal project, and would rule out the
React/Next.js learning goal. The PWA route costs nothing and still gives a Home Screen icon and a
chrome-less standalone launch.

## One deployable artifact

Next.js serves both the React UI and the server-side BFF from a single build and a single process.
There is no separate backend service, so there is no CORS surface, no cross-service authentication,
and one set of environment variables. Route handlers under `src/app/api/` are the BFF; they are
files in the same tree, not a second deployment.

## Standalone display without a service worker

Home Screen standalone launch comes from the web app manifest's `display: standalone`, honoured by
iOS since 16.4, plus the legacy `apple-mobile-web-app-capable` meta tag for older versions. Next
emits the standardised `mobile-web-app-capable` name from `metadata.appleWebApp.capable`, so the
Apple-prefixed tag is set explicitly alongside it.

A service worker is required for offline operation, not for standalone display. None is registered.
The trigger to revisit this is a concrete offline requirement — logging something in a gym with no
signal — at which point the caching strategy is a decision in its own right.

`viewport-fit=cover` is set so `env(safe-area-inset-*)` resolves to real values; the insets are
exposed as CSS custom properties in `globals.css` so component stylesheets never write `env()`.

## Hosting

Decided in [004-hosting-provider.md](004-hosting-provider.md): Vercel, on its free Hobby tier.
`next.config.ts` stays provider-neutral regardless — nothing in this codebase imports a
platform-specific SDK.

## TypeScript configuration is pinned to what Next requires

`tsconfig.json` is written to match what Next 16 would otherwise rewrite on first `next dev` —
notably `jsx: react-jsx` (Next uses the React automatic runtime), the `next` language-service
plugin, the `.next/types` and `.next/dev/types` includes, and `exclude` narrowed to `node_modules`
so those includes are not cancelled. The repository's stricter options — `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `allowJs: false` — survive untouched and must not be weakened to make a
build pass.
