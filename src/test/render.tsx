import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ClockContext } from '../shared/clock/ClockContext'

type RenderOptions = {
  /** Fixed "now" for the UI. */
  now: Date
}

/** Renders with a fresh query cache (no retries) and a fixed clock. */
export function renderWithProviders(ui: ReactElement, { now }: RenderOptions): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const clock = () => now

  return render(
    <QueryClientProvider client={queryClient}>
      <ClockContext.Provider value={clock}>{ui}</ClockContext.Provider>
    </QueryClientProvider>,
  )
}
