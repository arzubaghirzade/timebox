import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBookingsApi } from '../api/BookingsApiContext'
import type { BookingDraft, DateString } from '../domain/types'
import { isStaleDataError } from '../errors'
import { bookingKeys } from './useBookings'

/**
 * Create / update / delete for the bookings of one date. The list is refreshed
 * after every success, and after errors that mean it is out of date
 * (409 conflict, 404 gone, 422 rule broken by a change elsewhere).
 */
export function useBookingMutations(date: DateString) {
  const api = useBookingsApi()
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: bookingKeys.byDate(date) })
  const refreshIfStale = async (error: Error) => {
    if (isStaleDataError(error)) await refresh()
  }

  const create = useMutation({
    mutationFn: (draft: BookingDraft) => api.create(draft),
    onSuccess: refresh,
    onError: refreshIfStale,
  })

  const update = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: BookingDraft }) => api.update(id, draft),
    onSuccess: refresh,
    onError: refreshIfStale,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: refresh,
    onError: refreshIfStale,
  })

  return { create, update, remove }
}
