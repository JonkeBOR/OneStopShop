# Contract: Google Sheet Layout

**Feature**: [spec.md](../spec.md) | **Date**: 2026-09-10

The spreadsheet the adapter expects. The owner creates it by hand (spec Assumptions); the app never
provisions it, but must report clearly when it is wrong (`STORE_MISCONFIGURED`).

---

## Workbook

One spreadsheet, its id supplied as `GOOGLE_SHEET_ID`. One tab per collection, the tab name being the
collection name. This feature needs exactly one tab.

## Tab: `Bodyweight`

Row 1 is a header and is never read as data. Rows 2 onward are records.

| Column | Header       | Content                             | Example                    |
| ------ | ------------ | ----------------------------------- | -------------------------- |
| A      | `id`         | UUID, server-assigned               | `0f8c1b7e-…`               |
| B      | `recordedOn` | ISO date, `YYYY-MM-DD`              | `2026-09-10`               |
| C      | `kilograms`  | Decimal, `.` separator, written raw | `82.4`                     |
| D      | `createdAt`  | ISO 8601 timestamp, UTC             | `2026-09-10T06:12:03.000Z` |

Written with `valueInputOption=RAW` so Sheets does not reinterpret the date as a serial number or the
decimal by locale.

## Why this shape

**Row per record, append-only.** Appending is one API call with no read-modify-write, so two devices
writing at the same moment cannot overwrite each other — the spec's concurrency edge case is handled
by the storage shape rather than by locking.

**Tab per collection.** Adding workouts later means adding a `Workouts` tab, not restructuring this
one. This is the whole of what FR-030 asks for: a layout that does not preclude the fuller model.

**Header row present but not authoritative.** It is there so the sheet is readable by the human who
owns it. The adapter reads by column position, not by header name, so renaming a header for
readability does not break the app — but reordering columns does.

## What breaks it

| Condition                                   | App behaviour                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Tab renamed or deleted                      | `STORE_MISCONFIGURED` → 500, message says the store needs configuration                                     |
| Spreadsheet trashed, or the id wrong        | `STORE_MISCONFIGURED`                                                                                       |
| A row hand-edited into an unparseable state | That row is skipped; the rest of the history renders                                                        |
| Columns reordered                           | Rows fail to parse and are skipped — silently wrong, and the one hazard this layout does not defend against |

The last row is worth stating plainly rather than hiding: reading by position is the simple choice, and
its cost is that column order is part of the contract.

## Setup

Creating this sheet is a README step (FR-036): create a spreadsheet, rename the first tab to
`Bodyweight`, put the four headers in row 1, and copy the id out of the URL between `/d/` and `/edit`.

Then **share it with the service account's address as an Editor**. The app reaches the sheet as
itself, not as the owner (research R12), so ownership of the sheet grants it nothing. Omitting this
step is the single most likely setup mistake, and it fails as a `403` rather than as anything that
mentions sharing — which is why the adapter reports it as `STORE_MISCONFIGURED` and the README calls
it out.
