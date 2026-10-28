import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { CONCURRENT_BOOKING_TITLE, type MockControls } from '../../../mocks/handlers'
import type { BookingStore } from '../../../mocks/store'
import { ApiError } from '../../../shared/api/http'
import { installMockApi } from '../../../test/mockApi'
import { server } from '../../../test/mswServer'
import type { Booking } from '../domain/types'
import { createHttpBookingsApi } from './bookingsApi'

// These tests run the real HTTP client against the real mock handlers,
// so they cover the request/response contract end to end.

const TODAY = '2026-10-28'
const TOMORROW = '2026-10-29'
const YESTERDAY = '2026-10-27'
const NOW = new Date(2026, 9, 28, 10, 15) // local 10:15

const seed: Booking[] = [
  { id: 'a', date: TOMORROW, start: '10:00', end: '11:00', title: 'Standup' },
  { id: 'b', date: TOMORROW, start: '14:00', end: '15:00' },
  { id: 'c', date: TOMORROW, start: '09:00', end: '09:30' },
  { id: 'past', date: YESTERDAY, start: '11:00', end: '12:00' },
  { id: 'running', date: TODAY, start: '10:00', end: '11:00' },
]

const api = createHttpBookingsApi()

let store: BookingStore
let controls: MockControls

beforeEach(() => {
  ;({ store, controls } = installMockApi({ seed, now: NOW }))
})

/** Runs `promise`, expecting an ApiError, and returns it for assertions. */
async function apiError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.then(
    () => {
      throw new Error('Expected the request to fail')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ApiError)
  return error as ApiError
}

describe('GET /api/bookings', () => {
  it('returns bookings for the date, sorted by start', async () => {
    const bookings = await api.list(TOMORROW)
    expect(bookings.map((b) => b.id)).toEqual(['c', 'a', 'b'])
  })

  it('returns an empty list for a date without bookings', async () => {
    expect(await api.list('2026-11-15')).toEqual([])
  })

  it('rejects an invalid date with 400', async () => {
    const error = await apiError(api.list('2026-02-30'))
    expect(error).toMatchObject({ status: 400, code: 'INVALID_DATE', field: 'date' })
  })
})

describe('POST /api/bookings', () => {
  it('creates a booking and returns it with an id', async () => {
    const created = await api.create({ date: TOMORROW, start: '12:00', end: '13:00', title: '  Planning ' })
    expect(created).toEqual({ id: 'new-1', date: TOMORROW, start: '12:00', end: '13:00', title: 'Planning' })
    expect((await api.list(TOMORROW)).map((b) => b.id)).toContain('new-1')
  })

  it('omits a blank title', async () => {
    const created = await api.create({ date: TOMORROW, start: '12:00', end: '13:00', title: '   ' })
    expect(created).not.toHaveProperty('title')
  })

  it('allows a booking adjacent to existing ones', async () => {
    await expect(api.create({ date: TOMORROW, start: '11:00', end: '13:00' })).resolves.toBeDefined()
  })

  it('returns 409 on overlap and does not store the booking', async () => {
    const error = await apiError(api.create({ date: TOMORROW, start: '10:30', end: '11:30' }))
    expect(error).toMatchObject({ status: 409, code: 'OVERLAP', field: null })
    expect(await api.list(TOMORROW)).toHaveLength(3)
  })

  it.each([
    ['too short', { date: TOMORROW, start: '12:00', end: '12:15' }, 'TOO_SHORT', 'end'],
    ['too long', { date: TOMORROW, start: '12:00', end: '14:30' }, 'TOO_LONG', 'end'],
    ['outside hours', { date: TOMORROW, start: '17:30', end: '18:30' }, 'OUTSIDE_WORKING_HOURS', 'end'],
    ['past date', { date: YESTERDAY, start: '12:00', end: '13:00' }, 'PAST_DATE', 'date'],
    ['past time today', { date: TODAY, start: '09:30', end: '10:00' }, 'PAST_TIME', 'start'],
  ])('returns 422 for %s', async (_label, draft, code, field) => {
    const error = await apiError(api.create(draft))
    expect(error).toMatchObject({ status: 422, code, field })
  })

  it('prefers 422 over 409 when a rule is broken as well', async () => {
    // Overlaps "a" but is also too long.
    const error = await apiError(api.create({ date: TOMORROW, start: '09:30', end: '12:00' }))
    expect(error.status).toBe(422)
  })

  it('returns 400 for a malformed body', async () => {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: TOMORROW, start: 900 }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'BAD_REQUEST' })
  })
})

describe('PATCH /api/bookings/:id', () => {
  it('updates a booking without conflicting with itself', async () => {
    const updated = await api.update('a', { date: TOMORROW, start: '10:00', end: '11:30', title: 'Standup+' })
    expect(updated).toEqual({ id: 'a', date: TOMORROW, start: '10:00', end: '11:30', title: 'Standup+' })
  })

  it('returns 409 when the new time overlaps another booking', async () => {
    const error = await apiError(api.update('a', { date: TOMORROW, start: '13:30', end: '14:30' }))
    expect(error).toMatchObject({ status: 409, code: 'OVERLAP' })
    expect(store.get('a')).toMatchObject({ start: '10:00', end: '11:00' })
  })

  it('accepts a partial body, keeping the other fields', async () => {
    const response = await fetch('/api/bookings/a', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed' }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...seed[0], title: 'Renamed' })
  })

  it('removes the title when sent as null', async () => {
    const response = await fetch('/api/bookings/a', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: null }),
    })
    expect(await response.json()).not.toHaveProperty('title')
  })

  it('returns 404 for an unknown id', async () => {
    const error = await apiError(api.update('missing', { date: TOMORROW, start: '12:00', end: '13:00' }))
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it.each([
    ['a past booking', 'past', YESTERDAY],
    ['a booking in progress', 'running', TODAY],
  ])('returns 422 BOOKING_STARTED for %s', async (_label, id, date) => {
    const error = await apiError(api.update(id, { date, start: '16:00', end: '17:00' }))
    expect(error).toMatchObject({ status: 422, code: 'BOOKING_STARTED' })
  })
})

describe('DELETE /api/bookings/:id', () => {
  it('deletes a booking', async () => {
    await expect(api.remove('a')).resolves.toBeUndefined()
    expect((await api.list(TOMORROW)).map((b) => b.id)).toEqual(['c', 'b'])
  })

  it('returns 404 for an unknown id', async () => {
    const error = await apiError(api.remove('missing'))
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('returns 404 when deleting twice', async () => {
    await api.remove('a')
    expect((await apiError(api.remove('a'))).status).toBe(404)
  })

  it('refuses to delete a booking that has started', async () => {
    const error = await apiError(api.remove('running'))
    expect(error).toMatchObject({ status: 422, code: 'BOOKING_STARTED' })
    expect(store.get('running')).toBeDefined()
  })
})

describe('simulated concurrent booking', () => {
  it('makes the next create fail with 409 and leaves the competing booking in the list', async () => {
    controls.pendingConflicts = 1
    const draft = { date: TOMORROW, start: '12:00', end: '13:00' }

    const error = await apiError(api.create(draft))
    expect(error.status).toBe(409)

    const competing = (await api.list(TOMORROW)).find((b) => b.start === '12:00')
    expect(competing).toMatchObject({ end: '13:00', title: CONCURRENT_BOOKING_TITLE })
    expect(controls.pendingConflicts).toBe(0)
  })

  it('also applies to edits', async () => {
    controls.pendingConflicts = 1
    const error = await apiError(api.update('a', { date: TOMORROW, start: '12:00', end: '13:00' }))
    expect(error.status).toBe(409)
  })

  it('is consumed once, so retrying another slot succeeds', async () => {
    controls.pendingConflicts = 1
    await apiError(api.create({ date: TOMORROW, start: '12:00', end: '13:00' }))
    await expect(api.create({ date: TOMORROW, start: '15:00', end: '16:00' })).resolves.toBeDefined()
  })

  it('is not consumed by a malformed request', async () => {
    controls.pendingConflicts = 1
    await apiError(api.create({ date: TOMORROW, start: '13:00', end: '12:00' }))
    expect(controls.pendingConflicts).toBe(1)
  })
})

describe('HTTP client error mapping', () => {
  it('maps a network failure to status 0', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.error()))
    const error = await apiError(api.list(TOMORROW))
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })
  })

  it('falls back to a generic error for a non-JSON 500', async () => {
    server.use(http.get('/api/bookings', () => new HttpResponse('oops', { status: 500 })))
    const error = await apiError(api.list(TOMORROW))
    expect(error).toMatchObject({ status: 500, code: 'HTTP_500' })
    expect(error.message).toMatch(/server ran into a problem/i)
  })

  it('reports an invalid JSON success body', async () => {
    server.use(http.get('/api/bookings', () => new HttpResponse('not json', { status: 200 })))
    const error = await apiError(api.list(TOMORROW))
    expect(error.code).toBe('INVALID_RESPONSE')
  })

  it('passes aborts through untouched', async () => {
    const controller = new AbortController()
    controller.abort()
    const error = await api.list(TOMORROW, controller.signal).catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as Error).name).toBe('AbortError')
  })
})
