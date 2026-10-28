/** Error body returned by the API for any non-2xx response. */
export type ApiErrorBody = {
  code: string
  message: string
  field?: string | null
}

/** Every failed request surfaces as an `ApiError`; `status` is `0` when the server was unreachable. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field: string | null

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.field = body.field ?? null
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiErrorBody).code === 'string' &&
    typeof (value as ApiErrorBody).message === 'string'
  )
}

function fallbackMessage(status: number): string {
  if (status >= 500) return 'The server ran into a problem. Please try again.'
  return `Request failed (HTTP ${status}).`
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** Serialized as the JSON request body. */
  json?: unknown
  signal?: AbortSignal
}

/**
 * Thin `fetch` wrapper: JSON in, JSON out, typed errors.
 * The response body is trusted to match `T`; the API is ours.
 */
export async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', json, signal } = options

  let response: Response
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: json === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
  } catch (error) {
    // Let callers (and React Query) see cancellations as such.
    if (signal?.aborted) throw error
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    })
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    throw new ApiError(
      response.status,
      isApiErrorBody(body) ? body : { code: `HTTP_${response.status}`, message: fallbackMessage(response.status) },
    )
  }

  if (response.status === 204) return undefined as T

  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError(response.status, {
      code: 'INVALID_RESPONSE',
      message: 'The server sent an unexpected response.',
    })
  }
}
