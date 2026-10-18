---
name: 'run-app'
description: 'Run OneStopShop locally: start the dev server, build, serve the production build, or expose the dev server on the LAN so the app can be opened in iPhone Safari. Use when asked to run, start, launch, build or preview the app, or to confirm a change in a real browser.'
argument-hint: 'Optional: dev | lan | build | start'
user-invocable: true
disable-model-invocation: false
---

# Running OneStopShop

The app runs through npm. The PowerShell scripts in `scripts/` are the quality gate, not a
launcher - they never build or serve the app.

## Development

    npm run dev

`next dev` with Turbopack on http://localhost:3000. Leave it running; Turbopack hot-reloads edits,
so an edit does not need a restart. The exception is Vitest: stop it before `check.ps1` or any
storage test run, because it makes storage tests fail intermittently. The `test` skill, under
"Stop the dev server first", has the command.

## Production build

    npm run build
    npm run start

`next build` also type-checks with the local `tsc`. Run it before concluding that a change is
deployable - it catches Server/Client boundary errors that `next dev` tolerates.

## LAN exposure for iPhone testing

    npm run dev -- -H 0.0.0.0

Open the phone's Safari at `http://<lan-ip>:3000`. The dev server prints the address as `Network:`
on startup - it was `http://192.168.0.46:3000` on this machine, but a DHCP lease can move it, so
trust the printed value over this one.

Expect a Next.js cross-origin dev warning on first load. The fix is `allowedDevOrigins` in
`next.config.ts` - hostname only, no scheme and no port:

    const nextConfig: NextConfig = { allowedDevOrigins: ['192.168.0.46'] };

## What the LAN check does and does not prove

It proves layout, safe-area insets and icons on the real device.

It does **not** prove standalone launch. Safari's manifest handling on an insecure origin is not
something Apple documents, so the chrome-less Home Screen launch is only properly provable from an
HTTPS origin. Deploy before concluding the PWA works.

## Relationship to the browser tooling

The Playwright MCP browser and `scripts/e2e.ps1` both drive http://localhost:3000. `e2e.ps1` starts
a dev server if none is running and reuses yours if one is; the MCP never starts one. See the
`test` skill.
