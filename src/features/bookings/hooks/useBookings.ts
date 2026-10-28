import { useQuery } from '@tanstack/react-query'
import { useBookingsApi } from '../api/BookingsApiContext'
import type { DateString } from '../domain/types'

export const bookingKeys = {
  all: ['bookings'] as const,
  byDate: (date: DateString) => ['bookings', date] as const,
}

export function useBookings(date: DateString) {
  const api = useBookingsApi()
  return useQuery({
    queryKey: bookingKeys.byDate(date),
    queryFn: ({ signal }) => api.list(date, signal),
  })
}
