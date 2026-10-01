# Feature Specification: Personal App Foundation (Fitness Tracker as First Feature)

**Feature Branch**: `feat/initial-architecture`

**Spec Directory**: `specs/001-app-foundation`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Personal App — Foundation Spec (Fitness Tracker Feature): a personal, multi-feature Next.js web app and iPhone Home Screen PWA. A landing page at `/` lists available features, starting with a single Fitness Tracker entry at `/fitness-tracker`. Google OAuth authentication and an application session cookie apply app-wide, with Google tokens held exclusively server-side. Persistence is a Google Sheet reached only through the server acting as a BFF, behind a shared data-access abstraction. A README must document the full Google Cloud setup from a clean machine. Hosting must be a single free-tier deployment; the provider is not chosen here."

## Clarifications

### Session 2026-09-10

- Q: Where should the line sit between code written here and libraries relied on for the Google OAuth
  and session implementation? → A: Hand-roll the protocol; a cryptography library for crypto only.
  Auth.js was considered and declined, partly because its App Router release is still beta and it
  wires itself through a convention the framework has deprecated.
- Q: Which unit should bodyweight be recorded in, and is the unit stored per measurement? → A:
  Kilograms, fixed app-wide. No unit is stored per record and the form offers no unit choice.
- Q: Should a measurement's date come from the phone's local calendar day or from the server? → A:
  From the server, using a timezone configured once. That day is the default; the owner may override
  it with an earlier date to backfill, and future dates are rejected.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Sign in once and stay signed in (Priority: P1)

The owner opens the app for the first time and is asked to sign in with their Google account. They
complete the Google prompt once and land in the app. On every later visit — reopening the Home
Screen icon, reloading, returning after the phone has been locked overnight, switching between
features — the app opens already signed in, with no Google prompt and no visible sign-in step.

**Why this priority**: Nothing else in the app can exist without it. Every feature reads and writes
the owner's private data, so the authenticated session is the gate in front of all of them, and the
"open the icon and just be in" experience is the difference between a Home Screen app and a website.

**Independent Test**: Fully testable on its own with no feature content behind it: sign in from a
clean browser profile, confirm arrival in the app, then close and reopen the app repeatedly over
several days and confirm no further sign-in prompt appears. Delivers value as the app's front door.

**Acceptance Scenarios**:

1. **Given** a visitor with no existing application session, **When** they open any page of the app,
   **Then** they are taken through the Google sign-in flow and, on success, returned to the page they
   originally asked for.
2. **Given** a signed-in owner, **When** they close the app entirely and reopen it later from the
   Home Screen, **Then** the app opens already authenticated without any Google interaction.
3. **Given** a signed-in owner, **When** they inspect every browser-accessible storage location and
   every response the app sends to the browser, **Then** no Google access token, refresh token or
   client secret appears anywhere.
4. **Given** a signed-in owner, **When** the session cookie is examined, **Then** it is marked so it
   cannot be read by page scripts, is only sent over an encrypted connection, and is not sent along
   with cross-site requests.
5. **Given** a signed-in owner whose Google authorisation has been revoked or has expired beyond
   recovery, **When** they next use the app, **Then** they are told they need to sign in again and are
   offered the Google sign-in flow, rather than seeing a broken page or stale data.
6. **Given** a signed-in owner, **When** they choose to sign out, **Then** the application session
   ends, the stored Google credentials for that session are discarded, and reopening the app requires
   signing in again.
7. **Given** a person who is not the app owner, **When** they complete Google sign-in successfully
   with their own account, **Then** the app refuses them access to any feature or data and explains
   that the account is not permitted.

---

### User Story 2 - Land on a home page that leads into features (Priority: P2)

The owner opens the app and sees a landing page that names the app and lists the features available
to them. Today the list contains one entry, Fitness Tracker. Choosing it takes them into that
feature. From inside a feature they can get back to the landing page. Adding a second feature later
means adding a second entry to that list, not rebuilding navigation.

**Why this priority**: This is the shape of the whole product — a personal toolbox, not a fitness
app. Establishing the landing page and the per-feature route convention now is what keeps the second
feature cheap, and it is the visible half of the "add a feature without touching existing features"
promise.

**Independent Test**: Testable with a feature that does nothing but render its own name: sign in,
confirm the landing page lists Fitness Tracker, select it, confirm arrival at that feature's own
page, navigate back. Delivers value as a working, navigable installed app.

**Acceptance Scenarios**:

1. **Given** a signed-in owner, **When** they open the app's entry point, **Then** they see a landing
   page listing every available feature, currently exactly one: Fitness Tracker.
2. **Given** the landing page, **When** the owner selects Fitness Tracker, **Then** they arrive at the
   fitness tracker's own area of the app, at its own distinct address.
3. **Given** the owner is inside the fitness tracker, **When** they choose to go back to the home
   page, **Then** they return to the landing page without signing in again.
4. **Given** the app has been added to the iPhone Home Screen, **When** the owner launches it from
   that icon, **Then** the landing page and every feature page open in standalone mode without browser
   chrome, and moving between them stays inside the installed app.
5. **Given** a signed-out visitor, **When** they ask for a feature address directly rather than the
   landing page, **Then** they are sent through sign-in and, once signed in, arrive at that feature.

---

### User Story 3 - Record a fitness measurement and see it again later (Priority: P3)

Inside the fitness tracker the owner records a bodyweight measurement. It is saved to their personal
spreadsheet. When they return to the app later, on any device, the measurement and its date are
listed in their history.

**Why this priority**: It is the smallest slice that proves the entire chain the rest of the app
depends on — screen to server to spreadsheet and back — and it turns the architecture from a claim
into something demonstrable. It is deliberately one measurement type rather than the full workout
model, which is a later specification.

**Independent Test**: Testable end to end on its own: record a measurement, confirm the value appears
in the owner's spreadsheet, reload the app in a fresh session and confirm the measurement is listed.
Delivers real, if narrow, value: bodyweight tracking actually works.

**Acceptance Scenarios**:

1. **Given** a signed-in owner in the fitness tracker, **When** they record a bodyweight measurement
   with a date, **Then** it is stored in their spreadsheet and shown in their history.
2. **Given** previously recorded measurements, **When** the owner opens the fitness tracker, **Then**
   their history is listed in a consistent order, most recent first.
3. **Given** an owner recording a measurement, **When** they submit a value that is not a plausible
   bodyweight or omit a required field, **Then** the entry is rejected with a message saying what to
   fix, and nothing is written to the spreadsheet.
4. **Given** the spreadsheet is unreachable or the request fails, **When** the owner tries to record
   or read a measurement, **Then** they see a clear failure message and are able to retry, rather than
   seeing a blank screen or being told the save succeeded.
5. **Given** any interaction with fitness data, **When** the network traffic leaving the browser is
   examined, **Then** the browser has talked only to the application itself and never directly to any
   external data service.

---

### User Story 4 - Set the app up from a clean machine (Priority: P4)

Someone with the repository and a Google account — in practice, the owner on a new laptop, or the
owner a year from now — follows the README and gets the app running locally, signed in with Google
and reading and writing the spreadsheet, without needing knowledge that lives only in someone's head.

**Why this priority**: The Google Cloud configuration is the part of this project that cannot be
inferred from the code, and it is the part that will be forgotten. It is last only because it
documents the other three stories, so it can only be written accurately once they exist.

**Independent Test**: Testable by following the README top to bottom on a machine with no prior
project setup and confirming the app reaches a signed-in state with working spreadsheet access, with
every required value and console step accounted for.

**Acceptance Scenarios**:

1. **Given** a clean development machine and a Google account, **When** the README's setup section is
   followed in order, **Then** the app runs locally and completes Google sign-in successfully.
2. **Given** the README, **When** it is read for configuration, **Then** every required environment
   variable is listed by name with its purpose and where its value comes from.
3. **Given** the README, **When** its Google section is read, **Then** it covers choosing the cloud
   project, enabling spreadsheet access, configuring the consent screen and the OAuth client, allowing
   the owner's own account as a permitted user, the redirect addresses required, creating the
   credentials, and how the local configuration differs from the deployed one.
4. **Given** the repository at any commit, **When** its contents and history are searched for secrets,
   **Then** no client secret, token, API key or other credential is present.
5. **Given** the README's verification step, **When** it is performed, **Then** it confirms both that
   Google sign-in works and that the spreadsheet can actually be read and written.

---

### Edge Cases

- The owner's application session expires while the app is open in the background; the next action
  they take must recover cleanly rather than failing silently or losing what they typed.
- The Google sign-in flow is started from the Home Screen app: iOS may hand the sign-in off to a
  separate browser context, and the owner must end up back inside the installed app, signed in.
- Google's authorisation is revoked from the owner's account settings while an application session is
  still valid; the app must detect that its stored credentials no longer work and ask for sign-in
  again.
- The phone has no usable network in the gym: the app must fail visibly and recoverably. Offline
  capture is explicitly out of scope for this feature.
- The backing spreadsheet has been renamed, moved to the trash, had its tab renamed, or has never
  been created; the app must report a configuration problem rather than appear empty.
- The external data service refuses a request because of rate limits or a temporary outage; the owner
  must see a retryable error, and no partial or duplicated record may be left behind.
- The owner edits the spreadsheet by hand between two uses of the app, including leaving a blank row
  or a malformed value; reading history must not crash on it.
- Two of the owner's devices record entries at nearly the same moment; neither entry may overwrite
  the other.
- A feature address is requested that does not exist; the owner must get a clear not-found page
  inside the app rather than a framework error.

## Requirements _(mandatory)_

### Functional Requirements

**Authentication and session**

- **FR-001**: The app MUST require an authenticated owner for every page and every data operation,
  with no anonymous access to feature content or data.
- **FR-002**: The app MUST authenticate the owner through Google's OAuth sign-in flow.
- **FR-003**: The app MUST establish its own application session on successful Google sign-in,
  distinct from the Google authorisation itself, and MUST treat that session as the thing the browser
  presents on subsequent requests.
- **FR-004**: The application session MUST be carried by a cookie set with `HttpOnly`, `Secure`, and
  `SameSite=Lax` or stricter, so that it cannot be read by client-side scripts and is transmitted only
  over HTTPS.
- **FR-005**: The application session MUST persist across page reloads, app close and reopen, device
  restarts, and periods of inactivity, for a defined lifetime, without requiring a new interactive
  Google sign-in during that lifetime.
- **FR-006**: Google access tokens, refresh tokens, client secrets, and any other Google credential
  material MUST NOT be placed in `sessionStorage`, `localStorage`, IndexedDB, cookies readable by
  scripts, or any other client-accessible browser storage.
- **FR-007**: Google credential material MUST NOT be exposed to client-side code in any form,
  including embedded page data, rendered markup, and response bodies returned to the browser.
- **FR-008**: The server MUST be solely responsible for holding, renewing, and using every Google
  credential — the owner's sign-in credentials and the application's own store-access credentials
  alike — and all communication with Google's APIs MUST originate from the server.
- **FR-008a**: The credential used to reach the data store MUST belong to the application rather than
  to the owner's sign-in, MUST never be issued to or held by the browser, and MUST be usable
  independently of whether any owner is currently signed in.
- **FR-009**: Wherever the server persists Google credentials, that stored form MUST NOT be readable
  in plaintext by the client, whether it is held in an encrypted session payload or in server-side
  storage.
- **FR-010**: The app MUST obtain store-access credentials without owner interaction, renewing them
  when they expire, so that data access never depends on the owner being present or on the age of
  their sign-in.
- **FR-011**: The app MUST restrict access to an explicitly permitted Google account identity,
  refusing entry to any other account that completes Google sign-in successfully.
- **FR-012**: The app MUST provide a way to sign out that ends the application session.
- **FR-013**: A signed-out visitor who requests a protected address MUST be returned to that address
  after signing in.
- **FR-014**: A single application session MUST cover the entire app; moving between the landing page
  and any feature MUST NOT require re-authentication.

**Landing page, navigation, and feature structure**

- **FR-015**: The app MUST present a landing page at its root address that lists the features
  available to the owner.
- **FR-016**: The landing page MUST list exactly one feature initially, Fitness Tracker, and selecting
  it MUST navigate into that feature.
- **FR-017**: Each feature MUST occupy its own address space beneath the app root, with the fitness
  tracker at `/fitness-tracker`.
- **FR-018**: Feature-specific screens, data operations, and domain logic MUST be contained within
  that feature's own area of the codebase.
- **FR-019**: Cross-cutting concerns — authentication, session handling, the data-access abstraction,
  shared layout and navigation, and shared UI building blocks — MUST live outside any individual
  feature's area and MUST be usable by every feature.
- **FR-020**: Adding a new feature MUST be achievable by adding that feature's own area plus one entry
  on the landing page, without modifying any existing feature's code.
- **FR-021**: Every page of the app, landing page and feature pages alike, MUST work when the app is
  launched from the iPhone Home Screen in standalone mode, and in-app navigation MUST stay within the
  installed app.
- **FR-022**: The app MUST provide a way to return to the landing page from within a feature.
- **FR-023**: A request for an address that does not exist MUST produce a not-found page presented in
  the app's own styling.

**Data access and persistence**

- **FR-024**: The browser MUST NOT communicate with any external data service directly; every data
  request from the browser MUST go to the application itself.
- **FR-025**: All persisted application data MUST be stored in the owner's Google Sheet, reached
  exclusively through server-side calls to the Google Sheets API using the application's own
  store-access credential.
- **FR-026**: All features MUST read and write through one shared data-access abstraction rather than
  each reaching the storage provider on its own terms.
- **FR-027**: The data-access abstraction MUST express operations in the application's own terms, not
  in terms of the storage provider's API, so that the storage provider can be replaced without
  changing the screens or the application logic above it.
- **FR-028**: The endpoints the browser calls MUST be expressed in application terms and MUST NOT
  expose storage-provider concepts such as sheet names, ranges, or row numbers.
- **FR-029**: Data failures — the store being unreachable, refusing a request, or being misconfigured
  — MUST surface to the owner as a clear, retryable message, and MUST NOT report success for a write
  that did not happen.
- **FR-030**: The stored data layout MUST record fitness entries with their date so that history can
  later be queried and aggregated across weeks and months.

**Fitness tracker feature (initial slice)**

- **FR-031**: The fitness tracker MUST allow the owner to record a bodyweight measurement in
  kilograms, with a date. Kilograms is fixed for the whole app; no unit is stored per measurement and
  the entry form offers no unit choice.
- **FR-031a**: The app MUST determine the current day from a configured timezone, decided on the
  server, rather than from the server's own locale or from the browser's clock.
- **FR-031b**: A new measurement MUST default to the current day as determined by FR-031a, and the
  owner MUST be able to override that date with an earlier one to backfill a missed day.
- **FR-032**: The fitness tracker MUST display the owner's recorded measurements as a history in a
  consistent order.
- **FR-033**: The fitness tracker MUST reject an implausible or incomplete measurement with a message
  identifying the problem, and MUST NOT persist it. A date later than the current day in the
  configured timezone MUST be rejected as implausible.
- **FR-034**: Recorded measurements MUST survive session end and be visible on a later visit and from
  another device.

**Setup documentation and secrets**

- **FR-035**: The repository MUST contain a README that takes a clean development environment to a
  running, signed-in app with working spreadsheet access.
- **FR-036**: The README MUST contain a dedicated Google Cloud and Google Sheets setup section
  covering the cloud project, enabling the Sheets API, the OAuth consent screen, the OAuth client,
  allowing the owner's account as a permitted test user, the required redirect addresses, creating the
  sign-in credentials, creating the application's own store-access credential, and sharing the
  spreadsheet with it.
- **FR-037**: The README MUST list every required environment variable by name, state what it is for,
  and say where its value comes from.
- **FR-038**: The README MUST explain how local development configuration differs from deployed
  configuration, including the differing redirect addresses.
- **FR-039**: The README MUST include a verification step confirming both that Google sign-in works
  and that the spreadsheet can be read and written.
- **FR-040**: No credential of any kind — client secret, API key, access token, refresh token, session
  signing key — may be committed to the repository; all MUST be supplied through environment
  variables.
- **FR-041**: The README's Google Cloud steps MUST describe the configuration the app actually uses,
  not an assumed library's generic instructions.

**Deployment**

- **FR-042**: The app MUST be deployable as one unit serving both the screens and the server-side
  functionality; separate frontend and backend deployments MUST NOT be introduced.
- **FR-043**: The chosen hosting MUST offer a genuinely free tier, serve the app over HTTPS, support
  server-side execution, support configured secrets, permit outbound HTTPS calls to Google's APIs, and
  support persistent secure cookies.
- **FR-044**: A custom domain MUST NOT be a prerequisite for the app to work.

### Pre-Decided Technical Constraints

These are not choices this specification makes. They are fixed by the project constitution and by the
owner's explicit instruction, and are recorded here because requirements above depend on them.

- The app is a Next.js/React/TypeScript application, with Next.js serving both the client app and the
  server-side BFF as a single deployable unit; no separate backend service.
- Persistence is a Google Sheet through the Google Sheets API, server-side only. No SQL database or
  other datastore is introduced.
- Authentication is Google OAuth against the owner's own Google Cloud project.
- Hosting must fit a free tier; the specific provider is deliberately not chosen here.
- The OAuth authorization flow and the session cookie are implemented directly against the provider's
  documented endpoints rather than through an authentication framework. A cryptography library is used
  for signing, encryption and token verification, which are not primitives to hand-roll. This is a
  deliberate choice recorded under Clarifications, taken for the understanding it gives of the flow and
  to avoid resting the app's authentication on a pre-release dependency.
- The sheet schema and folder conventions remain implementation decisions, constrained by the
  requirements above but not fixed by them.

### Key Entities _(include if feature involves data)_

- **Owner**: The single permitted human user, identified by one Google account identity. The app has
  no concept of multiple users, roles, or sharing.
- **Application Session**: The app's own record that the owner is signed in. Held by the browser only
  as an opaque, script-inaccessible cookie; has a lifetime, an end (sign-out or expiry), and an
  association with the Google credentials needed to act on the owner's behalf.
- **Google Credentials**: The access and refresh tokens authorising the app to reach the owner's
  spreadsheet. Exist only server-side, never in a form the client can read, and are discarded when the
  session they belong to ends.
- **Feature**: A named, independently addressable area of the app listed on the landing page. Fitness
  Tracker is the only one today. Has a name, a landing-page entry, and its own address space.
- **Data Store**: The owner's Google Sheet, reached only through the shared data-access abstraction.
  Holds one area per kind of record.
- **Bodyweight Measurement**: A weight in kilograms and a date, belonging to the owner. The unit is
  fixed app-wide and is not stored per measurement. The initial and
  only fitness record type in this feature.
- **Workout, Exercise, Set**: The fuller strength-training model — a session containing exercises,
  each with sets of repetitions and weights. Named here as the direction the data layout must not
  preclude; specifying and building it is deliberately deferred to a later feature.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A returning owner who has signed in once reaches usable app content with zero sign-in
  interactions on 100% of opens for at least 30 consecutive days, including after device restarts and
  after leaving the app untouched for a week.
- **SC-002**: A first-time owner goes from opening the app to seeing the landing page in under 60
  seconds and no more than five interactions, the Google consent screen included.
- **SC-003**: An inspection of every browser-accessible storage location and of every response the app
  returns to the browser finds zero Google tokens, secrets, or other credential material — a result
  that must hold on 100% of inspections, in every app state.
- **SC-004**: An examination of the browser's outbound network traffic during any app operation shows
  requests to the application's own origin only, and none to any external data service.
- **SC-005**: A bodyweight measurement recorded in the app is present in the owner's spreadsheet
  within 5 seconds and is still listed after closing the app and reopening it in a fresh session on a
  different device.
- **SC-006**: Adding a second, unrelated feature requires creating that feature's own area and adding
  one landing-page entry, with zero changes to fitness tracker files — verifiable by diff.
- **SC-007**: Following the README on a machine with no prior project setup produces a running,
  signed-in app with working spreadsheet reads and writes in under 30 minutes, with no step requiring
  information absent from the README.
- **SC-008**: Every attempt to reach a feature page or a data operation without a valid session, and
  every attempt by a non-permitted Google account, is refused — 100% of attempts, with no data
  returned.
- **SC-009**: Launched from the iPhone Home Screen, the landing page and every feature page display
  without browser chrome, and no in-app navigation escapes the installed app.
- **SC-010**: Every failure the owner can provoke — no network, unreachable store, misconfigured
  spreadsheet, invalid input, expired authorisation — produces a readable message and a way forward,
  with no blank screen, raw error text, or false success.
- **SC-011**: A search of the repository and its history finds zero committed credentials.

## Assumptions

- **One user, one Google account.** The app serves the owner alone. No multi-user support, roles,
  sharing, or invitations are in scope, and the permitted identity is a configuration value rather
  than a managed user list.
- **The fitness slice is deliberately minimal.** The owner's instruction was to establish architecture
  and scaffolding rather than the fitness domain model, so this feature includes exactly one record
  type — bodyweight measurement — chosen because it is the smallest slice that exercises the full path
  from screen through the server to the spreadsheet and back. Workouts, exercises, sets, repetitions,
  weights, and trend aggregation are a later specification; this feature only commits to a data layout
  that does not preclude them.
- **The spreadsheet is created by hand.** The owner creates the Google Sheet and supplies its
  identifier through configuration; the app does not create or provision it, though it must report
  clearly when it is missing or misconfigured.
- **Sign-in identity and store access use separate Google credentials.** Google OAuth establishes
  _who_ the owner is and nothing more; the credential that reaches the spreadsheet is a separate
  service account belonging to the application, with the sheet shared to it. An earlier draft assumed
  the owner's own sign-in credentials would reach the sheet; that was reversed once it emerged that
  the route forces a weekly re-authentication or a scope verification the app does not need.
- **The owner has one timezone, set in configuration.** The app does not detect it, follow the device,
  or handle the owner travelling across zones; a trip would record days by home time until the
  configuration changes. For a single owner logging a daily weigh-in, that is a smaller problem than a
  browser clock the server cannot trust.
- **Session lifetime is long by default.** A persistent session measured in weeks rather than hours is
  assumed appropriate for a personal, single-user app on a passcode-locked phone; the exact lifetime
  is an implementation decision.
- **Offline use is out of scope.** The app is assumed to have network access when used. Recording
  without signal is a known future need, not a requirement here.
- **Hosting is deferred.** No provider is chosen; the constraints in FR-043 are what any candidate
  must satisfy. A device test over HTTPS is likely to force this decision.
- **Existing foundations are reused.** The Next.js App Router application, its design tokens, the
  string constants convention, the web app manifest and Home Screen metadata, and the Vitest and
  Playwright setups already exist and are extended rather than rebuilt.
- **Development is test-driven.** Per the project's recorded workflow, this feature is built with a
  Vitest inner loop and one Playwright acceptance test per user story, written first.
