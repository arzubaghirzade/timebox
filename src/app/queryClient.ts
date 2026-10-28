import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '../shared/api/http'

/** Client errors (4xx) will not succeed on retry; network and 5xx errors get one more attempt. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (isApiError(error) && error.status >= 400 && error.status < 500) return false
  return failureCount < 1
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}
