import { request } from '../../../shared/api/http'
import type { Booking, BookingDraft, DateString } from '../domain/types'

/**
 * The only way UI code talks to the backend. Swapping the mock for a real API
 * means providing another implementation (or just a different `baseUrl`).
 * All methods reject with `ApiError`.
 */
export interface BookingsApi {
  list(date: DateString, signal?: AbortSignal): Promise<Booking[]>
  create(draft: BookingDraft): Promise<Booking>
  update(id: string, draft: BookingDraft): Promise<Booking>
  remove(id: string): Promise<void>
}

export function createHttpBookingsApi(baseUrl = '/api'): BookingsApi {
  const collection = `${baseUrl}/bookings`
  const item = (id: string) => `${collection}/${encodeURIComponent(id)}`

  return {
    list: (date, signal) =>
      request<Booking[]>(`${collection}?${new URLSearchParams({ date })}`, { signal }),
    create: (draft) => request<Booking>(collection, { method: 'POST', json: draft }),
    update: (id, draft) => request<Booking>(item(id), { method: 'PATCH', json: draft }),
    remove: (id) => request<void>(item(id), { method: 'DELETE' }),
  }
}

export const bookingsApi: BookingsApi = createHttpBookingsApi()
