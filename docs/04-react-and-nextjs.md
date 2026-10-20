# React and Next.js Conventions

These conventions follow the constitution's Server-Mediated Data Access and Session/Identity
Separation principles, and the architecture decisions recorded in `docs/architecture/`.

## Server Components are the default

Every component is a Server Component unless it needs otherwise. `'use client'` is justified only
by one of:

- Interaction state (`useState`, `useReducer`) or effects (`useEffect`).
- Event handlers bound to user input.
- Browser-only APIs — storage, service worker registration, the install prompt.
- A charting or UI library that requires the client.

## Push `'use client'` down

Put the directive on the smallest component that needs it, not on a page or layout. A client
boundary near the root drags the whole subtree into the browser bundle. A page stays a Server
Component that fetches data and renders small interactive leaves.

## Data access

The client never talks to the database. It calls application endpoints — `GET /api/workouts`,
`POST /api/bodyweight` — and reasons about fitness data, never about tables, SQL or the D1 binding.

- Server Components read data by calling the server-side data module directly. Do not `fetch` the
  app's own route handlers from a Server Component.
- Client Components fetch through `/api/*` route handlers.
- Database access lives in one server-only module. Route handlers and Server Components call that
  module; nothing else knows the storage provider or touches the `DB` binding.

## Route handlers

A route handler validates its input, calls the data module, and maps the result to a response. It
holds no business logic and no database-specific code.

Every handler that touches fitness data first resolves the application session and rejects an
unauthenticated request with 401. Google tokens are discarded after sign-in; the browser only ever
holds the application session cookie.

## Protecting pages

Every page that needs the owner starts with `await requireSession(path)` from
`@/lib/server/session-cookie`, which redirects to `/sign-in` without a valid session. Auth checks
never go in Proxy, which OpenNext cannot run on Workers, and never only in a layout, which does not
re-render on client navigation. See `docs/architecture/004-hosting-and-persistence.md`.

Keep the async page thin: await the session or data, then render a synchronous presentational
component that Vitest can render directly.

Return `Response.json(...)` with an explicit status. Errors return a stable shape and never leak a
provider message, stack trace or token to the client.

## Folder structure

    src/
      app/            routes, layouts, and route handlers under app/api/
      components/     shared presentational components
      features/       feature folders, each owning its components and logic
      lib/            shared non-UI code
      lib/server/     server-only modules (config, session cookie, google sign-in, database)
      lib/strings/    user-facing text constants

Code used by one feature lives in that feature's folder until a second consumer appears.

## Components

Components are functions, typed by their props type, with props destructured in the signature.
Keep them small enough to read at a glance. A component that both fetches and renders complex UI is
two components.

## Hooks

`react-hooks` rules are errors, not warnings. Do not silence the dependency array rule — a
suppressed dependency is a stale-data bug. If a dependency is a problem, the effect is usually the
problem: move the value into state, derive it during render, or drop the effect entirely.

Effects are for synchronising with something outside React. Data that can be computed during render
is computed during render, not stored in state and updated in an effect.

## Creating an entity

An entity with anything to set up beyond its name — more fields, or child items such as a program's
blocks and workouts — is created in two steps. Its list shows an `AddLink`, a plus icon whose
aria-label comes from the strings module, beside the screen or section title, linking to `…/new`.
That page has only the name and a Submit button, rendered with `NewNameForm`; its back link cancels
and nothing is saved. Submit posts the name. The server refuses a duplicate with `name-taken`, shown
inline, or creates the entity, and the page is replaced by the entity's edit page, where the rest of
its fields appear. Because the page is replaced, going back from the edit page lands on the list,
not on the empty form.

Names are unique within their owner — a program or exercise per profile, a workout per program, a
variant per exercise — and compared with `nameKey`, ignoring letter case and surrounding spaces, on
rename as well as on create.

An entity that is only a name is added in place with `AddNameForm`, and one that needs no input at
all is added with `ActionButton`, as a training block is. Quick-creating an exercise from the slot
form's exercise picker stays inline on purpose: it happens in the middle of another task.

## Accessibility

`jsx-a11y` recommended rules are on. The app is a Home Screen PWA driven by touch: interactive
elements are real `button` and `a` elements, every input has a label, and tap targets are not
smaller than the surrounding text implies.
