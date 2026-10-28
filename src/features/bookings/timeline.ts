import { WORKING_DAY_END, WORKING_DAY_START } from './domain/constants'
import { fromMinutes, toMinutes } from './domain/time'
import type { Booking, TimeString } from './domain/types'

/** The timeline replaces the stacked list from this width up. */
export const TIMELINE_MEDIA_QUERY = '(min-width: 960px)'

const OPEN = toMinutes(WORKING_DAY_START)
const CLOSE = toMinutes(WORKING_DAY_END)

export const WORKING_DAY_MINUTES = CLOSE - OPEN

/** Minutes from opening time, and length in minutes; drives the block's CSS position. */
export type TimelinePosition = { offset: number; duration: number }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/**
 * Where a booking sits on the 09:00–18:00 track. Values are clamped to the
 * working day so a malformed booking can never be drawn outside the track.
 */
export function timelinePosition(booking: Pick<Booking, 'start' | 'end'>): TimelinePosition {
  const start = clamp(toMinutes(booking.start), OPEN, CLOSE)
  const end = clamp(toMinutes(booking.end), start, CLOSE)
  return { offset: start - OPEN, duration: end - start }
}

/** Hour marks for the rail: 09:00, 10:00, … 18:00. */
export function timelineHours(): TimeString[] {
  const hours: TimeString[] = []
  for (let minutes = OPEN; minutes <= CLOSE; minutes += 60) hours.push(fromMinutes(minutes))
  return hours
}
