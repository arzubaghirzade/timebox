import { setupWorker } from 'msw/browser'
import { createBookingHandlers } from './handlers'
import { createSeedBookings } from './seed'
import { createBookingStore } from './store'

const LATENCY_MS = 400

/**
 * Starts the mock API in the browser (dev and the deployed demo).
 *
 * `?mockConflict` in the URL makes the next create/edit lose a race against a
 * simulated concurrent user, so the 409 handling can be reviewed on demand.
 */
export async function startMockApi(): Promise<void> {
  const conflictParam = new URLSearchParams(window.location.search).get('mockConflict')
  const pendingConflicts = conflictParam === null ? 0 : Math.max(1, Number.parseInt(conflictParam, 10) || 1)

  const worker = setupWorker(
    ...createBookingHandlers({
      store: createBookingStore(createSeedBookings(new Date())),
      now: () => new Date(),
      controls: { pendingConflicts },
      latencyMs: LATENCY_MS,
    }),
  )

  await worker.start({
    onUnhandledFrame: 'bypass',
    quiet: import.meta.env.PROD,
  })
}
