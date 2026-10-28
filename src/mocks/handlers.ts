import { delay, http, HttpResponse } from 'msw'
import type { ApiErrorBody } from '../shared/api/http'
import { hasStarted, normalizeTitle } from '../features/bookings/domain/rules'
import { isValidDate, isValidTime, toMinutes, toNowSnapshot } from '../features/bookings/domain/time'
import type { Booking, BookingDraft } from '../features/bookings/domain/types'
import { validateBooking } from '../features/bookings/domain/validateBooking'
import type { BookingStore } from './store'

export type MockControls = {
  /**
   * Number of upcoming writes (POST/PATCH) that will be beaten by a simulated
   * concurrent user booking the same slot first. Demonstrates the 409 flow.
   */
  pendingConflicts: number
}

export type BookingHandlersOptions = {
  store: BookingStore
  now: () => Date
  controls: MockControls
  latencyMs?: number
  baseUrl?: string
}

export const CONCURRENT_BOOKING_TITLE = 'Booked by another user'

function errorResponse(status: number, body: ApiErrorBody) {
  return HttpResponse.json(body, { status })
}

const BAD_REQUEST: ApiErrorBody = {
  code: 'BAD_REQUEST',
  message: 'Request body must contain date, start and end strings and an optional title.',
}

/**
 * Reads the request body into draft fields. For PATCH the missing fields are
 * taken from `fallback`, so partial updates work too.
 */
async function readDraft(request: Request, fallback?: Booking): Promise<BookingDraft | null> {
  const body: unknown = await request.json().catch(() => null)
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null

  const raw = body as Record<string, unknown>
  const pick = (key: 'date' | 'start' | 'end'): string | null => {
    const value = raw[key] ?? fallback?.[key]
    return typeof value === 'string' ? value : null
  }
  const date = pick('date')
  const start = pick('start')
  const end = pick('end')
  if (date === null || start === null || end === null) return null

  const title = 'title' in raw ? raw.title : fallback?.title
  if (title !== undefined && title !== null && typeof title !== 'string') return null

  const draft: BookingDraft = { date, start, end }
  const normalizedTitle = normalizeTitle(title ?? undefined)
  if (normalizedTitle !== undefined) draft.title = normalizedTitle
  return draft
}

export function createBookingHandlers({
  store,
  now,
  controls,
  latencyMs = 0,
  baseUrl = '/api',
}: BookingHandlersOptions) {
  const collection = `${baseUrl}/bookings`

  const wait = async () => {
    if (latencyMs > 0) await delay(latencyMs)
  }

  /** Another "user" grabs the requested slot just before this write lands. */
  const simulateConcurrentWrite = (draft: BookingDraft) => {
    if (controls.pendingConflicts <= 0) return
    const wellFormed =
      isValidDate(draft.date) &&
      isValidTime(draft.start) &&
      isValidTime(draft.end) &&
      toMinutes(draft.start) < toMinutes(draft.end)
    if (!wellFormed) return
    controls.pendingConflicts -= 1
    store.insert({ date: draft.date, start: draft.start, end: draft.end, title: CONCURRENT_BOOKING_TITLE })
  }

  /** Rule violations → 422; overlap (checked last) → 409; valid → null. */
  const rejectInvalid = (draft: BookingDraft, excludeId?: string) => {
    const { issues } = validateBooking(draft, {
      existing: store.all(),
      now: toNowSnapshot(now()),
      excludeId,
    })
    const ruleViolation = issues.find((issue) => issue.code !== 'OVERLAP')
    if (ruleViolation) {
      return errorResponse(422, { code: ruleViolation.code, message: ruleViolation.message, field: ruleViolation.field })
    }
    const overlap = issues.find((issue) => issue.code === 'OVERLAP')
    if (overlap) {
      return errorResponse(409, {
        code: 'OVERLAP',
        message: 'This time slot is no longer available. Someone else booked an overlapping time.',
        field: null,
      })
    }
    return null
  }

  const rejectStarted = (booking: Booking) =>
    hasStarted(booking, toNowSnapshot(now()))
      ? errorResponse(422, {
          code: 'BOOKING_STARTED',
          message: 'This booking has already started and can no longer be changed.',
          field: null,
        })
      : null

  const notFound = () =>
    errorResponse(404, { code: 'NOT_FOUND', message: 'This booking no longer exists.', field: null })

  return [
    http.get(collection, async ({ request }) => {
      await wait()
      const date = new URL(request.url).searchParams.get('date')
      if (date === null || !isValidDate(date)) {
        return errorResponse(400, {
          code: 'INVALID_DATE',
          message: 'Query parameter "date" must be a valid YYYY-MM-DD date.',
          field: 'date',
        })
      }
      return HttpResponse.json(store.listByDate(date))
    }),

    http.post(collection, async ({ request }) => {
      await wait()
      const draft = await readDraft(request)
      if (!draft) return errorResponse(400, BAD_REQUEST)

      simulateConcurrentWrite(draft)
      const rejection = rejectInvalid(draft)
      if (rejection) return rejection

      return HttpResponse.json(store.insert(draft), { status: 201 })
    }),

    http.patch<{ id: string }>(`${collection}/:id`, async ({ request, params }) => {
      await wait()
      const current = store.get(params.id)
      if (!current) return notFound()

      const started = rejectStarted(current)
      if (started) return started

      const draft = await readDraft(request, current)
      if (!draft) return errorResponse(400, BAD_REQUEST)

      simulateConcurrentWrite(draft)
      const rejection = rejectInvalid(draft, current.id)
      if (rejection) return rejection

      const updated = store.update(current.id, draft)
      return updated ? HttpResponse.json(updated) : notFound()
    }),

    http.delete<{ id: string }>(`${collection}/:id`, async ({ params }) => {
      await wait()
      const current = store.get(params.id)
      if (!current) return notFound()

      const started = rejectStarted(current)
      if (started) return started

      store.remove(current.id)
      return new HttpResponse(null, { status: 204 })
    }),
  ]
}
