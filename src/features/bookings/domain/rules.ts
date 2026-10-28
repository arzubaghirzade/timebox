import { WORKING_DAY_END, WORKING_DAY_START } from './constants'
import { toMinutes } from './time'
import type { Booking, BookingDraft, DateString, NowSnapshot, TimeString } from './types'

// All predicates below expect already-valid `HH:mm` / `YYYY-MM-DD` strings;
// format checks live in `validateBooking`.

type TimeRange = { start: TimeString; end: TimeString }

/** A booking may start at opening time but not at (or after) closing time. */
export function isStartWithinWorkingHours(start: TimeString): boolean {
  const minutes = toMinutes(start)
  return minutes >= toMinutes(WORKING_DAY_START) && minutes < toMinutes(WORKING_DAY_END)
}

/** A booking may end at closing time but not at (or before) opening time. */
export function isEndWithinWorkingHours(end: TimeString): boolean {
  const minutes = toMinutes(end)
  return minutes > toMinutes(WORKING_DAY_START) && minutes <= toMinutes(WORKING_DAY_END)
}

export function durationMinutes(start: TimeString, end: TimeString): number {
  return toMinutes(end) - toMinutes(start)
}

/**
 * Half-open interval overlap: `[start, end)`.
 * Ranges that only touch (10:00–11:00 and 11:00–12:00) do not overlap.
 */
export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end)
}

/**
 * First booking on the draft's date that overlaps it, ignoring `excludeId`
 * (the booking being edited must not conflict with itself).
 */
export function findConflict(
  draft: BookingDraft,
  existing: readonly Booking[],
  excludeId?: string,
): Booking | undefined {
  return existing.find(
    (booking) => booking.id !== excludeId && booking.date === draft.date && overlaps(booking, draft),
  )
}

/** `YYYY-MM-DD` compares correctly as a string. */
export function isPastDate(date: DateString, now: NowSnapshot): boolean {
  return date < now.date
}

/** True when `start` is already behind the clock on today's date. Starting at the current minute is allowed. */
export function isPastTimeToday(date: DateString, start: TimeString, now: NowSnapshot): boolean {
  return date === now.date && toMinutes(start) < now.minutes
}

export function hasStarted(booking: Pick<Booking, 'date' | 'start'>, now: NowSnapshot): boolean {
  return isPastDate(booking.date, now) || isPastTimeToday(booking.date, booking.start, now)
}

export function hasEnded(booking: Pick<Booking, 'date' | 'end'>, now: NowSnapshot): boolean {
  return isPastDate(booking.date, now) || (booking.date === now.date && toMinutes(booking.end) <= now.minutes)
}

/** Trims the title; blank becomes `undefined` so it is omitted from payloads. */
export function normalizeTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim()
  return trimmed ? trimmed : undefined
}
