import { createContext, useContext } from 'react'
import { bookingsApi, type BookingsApi } from './bookingsApi'

/** Lets the app (or a test) provide a different `BookingsApi` implementation. */
export const BookingsApiContext = createContext<BookingsApi>(bookingsApi)

export function useBookingsApi(): BookingsApi {
  return useContext(BookingsApiContext)
}
