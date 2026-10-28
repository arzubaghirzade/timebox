import type { Booking } from '../features/bookings/domain/types'
import { createBookingHandlers, type MockControls } from '../mocks/handlers'
import { createBookingStore, type BookingStore } from '../mocks/store'
import { server } from './mswServer'

type InstallOptions = {
  seed?: readonly Booking[]
  now: Date
}

/** Registers the real mock API handlers on the test server with a fresh store. */
export function installMockApi({ seed = [], now }: InstallOptions): { store: BookingStore; controls: MockControls } {
  let seq = 0
  const store = createBookingStore(seed, () => `new-${++seq}`)
  const controls: MockControls = { pendingConflicts: 0 }
  server.use(...createBookingHandlers({ store, now: () => now, controls }))
  return { store, controls }
}
