import { createContext, useContext } from 'react'

export type Clock = () => Date

/** Source of "now" for the UI. Tests provide a fixed clock instead of mocking timers. */
export const ClockContext = createContext<Clock>(() => new Date())

export function useClock(): Clock {
  return useContext(ClockContext)
}
