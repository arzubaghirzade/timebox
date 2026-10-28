import { describe, expect, it } from 'vitest'
import {
  durationMinutes,
  findConflict,
  hasEnded,
  hasStarted,
  isPastDate,
  isEndWithinWorkingHours,
  isPastTimeToday,
  isStartWithinWorkingHours,
  normalizeTitle,
  overlaps,
} from './rules'
import type { Booking, NowSnapshot } from './types'

const now: NowSnapshot = { date: '2026-10-28', minutes: 10 * 60 + 15 } // 10:15

describe('isStartWithinWorkingHours', () => {
  it.each([
    ['08:59', false],
    ['09:00', true],
    ['12:00', true],
    ['17:59', true],
    ['18:00', false],
    ['18:30', false],
  ])('%s → %s', (start, expected) => {
    expect(isStartWithinWorkingHours(start)).toBe(expected)
  })
})

describe('isEndWithinWorkingHours', () => {
  it.each([
    ['08:30', false],
    ['09:00', false],
    ['09:01', true],
    ['17:00', true],
    ['18:00', true],
    ['18:01', false],
  ])('%s → %s', (end, expected) => {
    expect(isEndWithinWorkingHours(end)).toBe(expected)
  })
})

describe('durationMinutes', () => {
  it.each([
    ['09:00', '09:30', 30],
    ['09:00', '11:00', 120],
    ['10:00', '09:00', -60],
    ['10:00', '10:00', 0],
  ])('%s–%s → %i', (start, end, expected) => {
    expect(durationMinutes(start, end)).toBe(expected)
  })
})

describe('overlaps', () => {
  const base = { start: '10:00', end: '11:00' }

  it.each([
    ['adjacent before', '09:00', '10:00', false],
    ['adjacent after', '11:00', '12:00', false],
    ['fully before', '09:00', '09:30', false],
    ['fully after', '11:30', '12:00', false],
    ['identical', '10:00', '11:00', true],
    ['overlaps start', '09:30', '10:30', true],
    ['overlaps end', '10:30', '11:30', true],
    ['contained', '10:15', '10:45', true],
    ['contains', '09:00', '12:00', true],
    ['one minute into start', '09:00', '10:01', true],
  ])('%s (%s–%s) → %s', (_label, start, end, expected) => {
    expect(overlaps(base, { start, end })).toBe(expected)
    // Overlap is symmetric.
    expect(overlaps({ start, end }, base)).toBe(expected)
  })
})

describe('findConflict', () => {
  const existing: Booking[] = [
    { id: 'a', date: '2026-10-29', start: '10:00', end: '11:00', title: 'Standup' },
    { id: 'b', date: '2026-10-29', start: '13:00', end: '14:00' },
    { id: 'c', date: '2026-10-30', start: '10:00', end: '11:00' },
  ]

  it('returns the overlapping booking', () => {
    expect(findConflict({ date: '2026-10-29', start: '10:30', end: '11:30' }, existing)?.id).toBe('a')
  })

  it('allows adjacent bookings', () => {
    expect(findConflict({ date: '2026-10-29', start: '11:00', end: '13:00' }, existing)).toBeUndefined()
  })

  it('ignores bookings on other dates', () => {
    expect(findConflict({ date: '2026-10-31', start: '10:00', end: '11:00' }, existing)).toBeUndefined()
  })

  it('excludes the booking being edited', () => {
    const draft = { date: '2026-10-29', start: '10:00', end: '10:45' }
    expect(findConflict(draft, existing)?.id).toBe('a')
    expect(findConflict(draft, existing, 'a')).toBeUndefined()
  })

  it('still detects conflicts with other bookings while editing', () => {
    expect(findConflict({ date: '2026-10-29', start: '12:30', end: '13:30' }, existing, 'a')?.id).toBe('b')
  })

  it('returns undefined for an empty list', () => {
    expect(findConflict({ date: '2026-10-29', start: '10:00', end: '11:00' }, [])).toBeUndefined()
  })
})

describe('isPastDate', () => {
  it.each([
    ['2026-10-27', true],
    ['2025-12-31', true],
    ['2026-10-28', false],
    ['2026-10-29', false],
  ])('%s → %s', (date, expected) => {
    expect(isPastDate(date, now)).toBe(expected)
  })
})

describe('isPastTimeToday', () => {
  it.each([
    ['2026-10-28', '10:00', true],
    ['2026-10-28', '10:14', true],
    ['2026-10-28', '10:15', false],
    ['2026-10-28', '10:30', false],
    // Only applies to today; past dates are handled by isPastDate.
    ['2026-10-29', '09:00', false],
    ['2026-10-27', '17:00', false],
  ])('%s %s → %s', (date, start, expected) => {
    expect(isPastTimeToday(date, start, now)).toBe(expected)
  })
})

describe('hasStarted / hasEnded', () => {
  it.each([
    ['yesterday', { date: '2026-10-27', start: '16:00', end: '17:00' }, true, true],
    ['ended earlier today', { date: '2026-10-28', start: '09:00', end: '10:00' }, true, true],
    ['ends right now', { date: '2026-10-28', start: '09:45', end: '10:15' }, true, true],
    ['in progress', { date: '2026-10-28', start: '10:00', end: '11:00' }, true, false],
    ['starts right now', { date: '2026-10-28', start: '10:15', end: '11:00' }, false, false],
    ['later today', { date: '2026-10-28', start: '14:00', end: '15:00' }, false, false],
    ['tomorrow', { date: '2026-10-29', start: '09:00', end: '10:00' }, false, false],
  ])('%s → started %s, ended %s', (_label, booking, started, ended) => {
    expect(hasStarted(booking, now)).toBe(started)
    expect(hasEnded(booking, now)).toBe(ended)
  })
})

describe('normalizeTitle', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['   ', undefined],
    ['  Planning  ', 'Planning'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected)
  })
})
