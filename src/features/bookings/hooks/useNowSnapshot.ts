import { useEffect, useState } from 'react'
import { useClock } from '../../../shared/clock/ClockContext'
import { toNowSnapshot } from '../domain/time'
import type { NowSnapshot } from '../domain/types'

const REFRESH_MS = 30_000

/**
 * Current date and minute, refreshed periodically so "past" state (read-only
 * bookings, unavailable start times) stays correct while the page is open.
 */
export function useNowSnapshot(): NowSnapshot {
  const clock = useClock()
  const [snapshot, setSnapshot] = useState(() => toNowSnapshot(clock()))

  useEffect(() => {
    const tick = () =>
      setSnapshot((previous) => {
        const next = toNowSnapshot(clock())
        return next.date === previous.date && next.minutes === previous.minutes ? previous : next
      })
    tick()
    const id = window.setInterval(tick, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [clock])

  return snapshot
}
