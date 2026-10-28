import { toDateString } from '../features/bookings/domain/time'
import type { Booking } from '../features/bookings/domain/types'

function shiftDays(date: Date, days: number): string {
  return toDateString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}

/** Demo data relative to `now`, so the app always has something to show. */
export function createSeedBookings(now: Date): Booking[] {
  const yesterday = shiftDays(now, -1)
  const today = shiftDays(now, 0)
  const tomorrow = shiftDays(now, 1)

  return [
    { id: 'seed-1', date: yesterday, start: '11:00', end: '12:00', title: 'Retrospective' },
    { id: 'seed-2', date: today, start: '09:00', end: '09:30', title: 'Daily standup' },
    { id: 'seed-3', date: today, start: '13:00', end: '14:00', title: 'Design review' },
    { id: 'seed-4', date: today, start: '16:00', end: '17:30' },
    { id: 'seed-5', date: tomorrow, start: '10:00', end: '11:00', title: 'Sprint planning' },
    { id: 'seed-6', date: tomorrow, start: '11:00', end: '12:00', title: 'Client call' },
  ]
}
