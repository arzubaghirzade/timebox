# Meeting Room Booking

A single-room booking UI for one working day (09:00–18:00): pick a date, see that day's bookings, and create, edit or delete them. Built as a take-home assessment with React, TypeScript (strict) and a mock API.

- **Live demo:** https://timebox-three-delta.vercel.app
- **Repository:** https://github.com/arzubaghirzade/timebox

## Running it

Requires Node.js ≥ 20.19 (see `.nvmrc`).

```bash
npm install
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with the mock API |
| `npm test` | Full test suite (Vitest + Testing Library + MSW) |
| `npm run typecheck` | TypeScript project check |
| `npm run lint` | oxlint |
| `npm run build` | Typecheck + production build (the mock API is included) |
| `npm run preview` | Serve the production build locally |

**Trying the conflict flow:** open the app with `?mockConflict` in the URL. The next create or edit loses a race against a simulated concurrent user, so the server answers `409` even though the UI thought the slot was free.

## What's done

- Date selection with a native date input plus Previous day / Today / Next day.
- Wide screens (≥ 960 px): a single-day timeline from 09:00 to 18:00. Each booking is a block positioned by its real start and end, showing time, title and status. Selecting an upcoming block (click, Enter or Space) opens it in the edit form, which also holds the Delete action. Blocks have fixed heights within their own slot, so they never overlap.
- Narrow screens: a stacked list with inline Edit and Delete buttons.
- "In progress" / "Finished" badges; started and past bookings are read-only.
- Create, edit and delete (with an inline confirmation step, not a browser dialog).
- All business rules, checked on the client as you type and again on the mock server:
  working hours, start < end, 30 min – 2 h, no overlaps (touching edges allowed), no past dates or past times today, and an edited booking never conflicts with itself.
- UI states: loading, empty, load error with retry, background refresh, submitting, server errors.
- Conflict handling (rule 8): on `409` the list is refreshed, the entered values are kept, focus moves to a clear message, and the client-side check then names the booking that now blocks the slot. `404` and `422` are handled the same way.
- Accessibility: labelled controls, errors linked with `aria-describedby` and `aria-invalid`, alerts and a polite live region for results, visible focus, focus moved to the first invalid field / the error / back to the triggering button, 44 px touch targets.
- Responsive: two columns from 720 px, the timeline from 960 px, one column on phones (checked at 375 px, no horizontal scroll). Light and dark colour schemes, AA contrast in both.

## Architecture

```
src/
  app/                     App shell, React Query client
  features/bookings/
    domain/                Pure business rules — no React, no network, no system clock
    api/                   BookingsApi interface + fetch implementation
    hooks/                 useBookings (query), useBookingMutations, useNowSnapshot
    components/            DateSelector, BookingList (+ BookingTimeline), BookingForm
    BookingsPage.tsx       Composes the feature
    errors.ts, format.ts   User-facing messages and date labels
  shared/
    api/http.ts            fetch wrapper → typed ApiError
    clock/                 Injectable clock (tests use a fixed time)
  mocks/                   MSW handlers, in-memory store, seed data
  test/                    Shared MSW server, render helper
```

- **Business rules are pure functions** (`domain/`). `validateBooking(draft, { existing, now, excludeId })` returns per-field and form-level issues with stable codes. The form and the mock server call the same function, so they cannot disagree.
- **Dates and times stay strings.** Dates are `YYYY-MM-DD`, times `HH:mm`. Comparisons use minutes since midnight; "today" and "now" come from local getters, never `toISOString()` (which is UTC and gives the wrong day near midnight). The domain tests pass in UTC+14, UTC−11 and other zones.
- **The network layer is replaceable.** UI code only talks to the `BookingsApi` interface; pointing it at a real backend means changing `baseUrl` or providing another implementation through `BookingsApiContext`.
- **The mock API is real HTTP.** MSW intercepts `fetch` in a service worker, so the app's request and error handling run exactly as they would against a server. The same handlers back the test suite.
- **Server state** lives in React Query, cached per date. Successful writes, and `404`/`409`/`422` errors, invalidate that date's list. **Form state** is local `useState`, reset only after a successful create.

### API contract (mock)

| Request | Success | Errors |
|---|---|---|
| `GET /api/bookings?date=YYYY-MM-DD` | `200 Booking[]` sorted by start | `400` invalid date |
| `POST /api/bookings` | `201 Booking` | `400` malformed body, `422` rule violation, `409` overlap |
| `PATCH /api/bookings/:id` | `200 Booking` (partial body allowed) | as above, plus `404`, `422 BOOKING_STARTED` |
| `DELETE /api/bookings/:id` | `204` | `404`, `422 BOOKING_STARTED` |

Error body: `{ code, message, field? }`. Rule violations are reported as `422` in preference to `409`, so `409` always means "someone else has this slot".

## Implementation assumptions

The spec leaves these points open; this is how they were resolved.

**Time and dates**
- Dates are `YYYY-MM-DD`, times are `HH:mm`, both in the browser's local time. Comparisons use minutes since midnight, never `Date` arithmetic across time zones.
- Any valid `HH:mm` is accepted; there is no fixed slot step.
- A start may be `09:00` but not `18:00`; an end may be `18:00` but not `09:00`.
- "Now" is truncated to the minute: a booking starting at the current minute is allowed.

**Past dates and started bookings**
- Past dates can be viewed; create, edit and delete are disabled for them.
- A booking that has already started (including one in progress) cannot be edited or deleted. The server enforces this too.

**Editing**
- Editing keeps the booking's date fixed to the currently selected date; only start, end and title change.
- The booking being edited is excluded from the overlap check.

**Validation**
- The title is optional, trimmed, and has no length limit (the spec defines none).
- A past date reports only "past date", not an additional "time has passed" error.
- Overlap is checked only once the date is valid and start is before end.

**Conflicts and stale data**
- On `409`, `404` or `422` from a save or delete, the day's bookings are refetched before the message is shown, so the list reflects what blocked the request.
- The form keeps every entered value and moves focus to the message. The server message disappears as soon as the user changes a field, since it described the values that were sent.
- If the booking being edited was deleted elsewhere (`404`), the form stays in edit mode with the user's values and says so; deleting an already deleted booking is reported as such.

**UI**
- English copy. Delete asks for confirmation inline; focus lands on "Keep", so a repeated Enter never deletes.
- The layout switch (timeline vs list) is chosen with `matchMedia` rather than CSS alone, so only one set of controls exists at a time for keyboard and screen-reader users. The hour rail is decorative (`aria-hidden`), since every block states its own times.

## Testing

265 tests, run with `npm test`:

- **Domain** — table-driven tests for every rule and boundary (09:00/18:00, 29/30/120/121 minutes, adjacency, containment, self-exclusion, past date/time, invalid formats, calendar arithmetic across month/year ends and DST).
- **API contract** — the real HTTP client against the real MSW handlers: every endpoint and status code, partial PATCH, the simulated concurrent booking, error mapping (network failure, non-JSON 500, aborts).
- **UI** — React Testing Library with user-event against the mock API and a fixed clock: loading/empty/error states, date navigation, create/edit/delete, inline validation, read-only rules, `409`/`404`/`422` recovery, and focus management — in both the list and the timeline layout (the timeline suite stubs `matchMedia`).

Key tests were checked by temporarily breaking the code they protect (removing self-exclusion, the refresh after a conflict, the stale-error reset) and confirming they fail.

## Not done / known limitations

- **Service worker required.** The mock API runs in a service worker. Where those are blocked (some private-browsing modes, some embedded browsers) the app shows its load-error state. A non-worker fallback would rely on MSW's experimental API, so it was left out.
- **Data resets on reload.** The store is in memory per tab; two tabs do not share bookings.
- **Time picker format follows the browser.** Native time inputs show 12-hour or 24-hour time depending on the browser locale; values are always sent and stored as `HH:mm`.
- **One time zone.** Client and mock server share the browser clock; a real backend would need an agreed time zone for "now".
- **No automated end-to-end or axe checks.** Accessibility and the 375 px layout were checked manually in Chrome; the next step would be Playwright with axe.
- **Edit keeps the date.** Moving a booking to another day means deleting and re-creating it.

## Time spent

Approximately 3 hours in total, including planning, implementation, review, the visual polish and timeline iterations, and deployment.

## Tooling and AI usage

Built with Claude Code as a pair programmer, in reviewed phases: requirements and plan, domain rules, API and mock server, read UI, write UI, conflict handling, polish. The chat transcript is included with the submission.

Dependencies beyond React and Vite: `@tanstack/react-query` (server state, cache per date, invalidation after conflicts) and `msw` (network-level mock API shared by the app and tests). Dev: Vitest, jsdom, Testing Library, oxlint.
