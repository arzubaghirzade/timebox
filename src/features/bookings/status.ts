import { hasEnded, hasStarted } from './domain/rules'
import type { Booking, NowSnapshot } from './domain/types'

export type BookingStatus = 'upcoming' | 'in-progress' | 'finished'

export function bookingStatus(booking: Booking, now: NowSnapshot): BookingStatus {
  if (hasEnded(booking, now)) return 'finished'
  if (hasStarted(booking, now)) return 'in-progress'
  return 'upcoming'
}

/** Badge text; upcoming bookings carry no badge. */
export const STATUS_LABEL: Record<BookingStatus, string | null> = {
  upcoming: null,
  'in-progress': 'In progress',
  finished: 'Finished',
}
