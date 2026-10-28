import { toMinutes } from '../features/bookings/domain/time'
import type { Booking, BookingDraft, DateString } from '../features/bookings/domain/types'

/** In-memory stand-in for a database table. Lives as long as the page. */
export type BookingStore = {
  all(): Booking[]
  listByDate(date: DateString): Booking[]
  get(id: string): Booking | undefined
  insert(draft: BookingDraft): Booking
  update(id: string, draft: BookingDraft): Booking | undefined
  remove(id: string): boolean
}

function toBooking(id: string, draft: BookingDraft): Booking {
  const booking: Booking = { id, date: draft.date, start: draft.start, end: draft.end }
  if (draft.title !== undefined) booking.title = draft.title
  return booking
}

export function createBookingStore(
  initial: readonly Booking[] = [],
  generateId: () => string = () => crypto.randomUUID(),
): BookingStore {
  const rows = new Map<string, Booking>(initial.map((booking) => [booking.id, { ...booking }]))

  return {
    all: () => [...rows.values()].map((booking) => ({ ...booking })),
    listByDate: (date) =>
      [...rows.values()]
        .filter((booking) => booking.date === date)
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))
        .map((booking) => ({ ...booking })),
    get: (id) => {
      const booking = rows.get(id)
      return booking && { ...booking }
    },
    insert: (draft) => {
      const booking = toBooking(generateId(), draft)
      rows.set(booking.id, booking)
      return { ...booking }
    },
    update: (id, draft) => {
      if (!rows.has(id)) return undefined
      const booking = toBooking(id, draft)
      rows.set(id, booking)
      return { ...booking }
    },
    remove: (id) => rows.delete(id),
  }
}
