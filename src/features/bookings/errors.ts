import { isApiError } from '../../shared/api/http'

/**
 * Responses that mean our copy of the day's bookings is stale (someone else
 * changed it). The list is refreshed when one of these comes back.
 */
export function isStaleDataError(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 409 || error.status === 422)
}

/** User-facing message for a failed create or update. */
export function describeSaveError(error: Error, mode: 'create' | 'edit'): string {
  if (isApiError(error)) {
    if (error.status === 409) {
      return 'Someone else just booked an overlapping time. The list has been updated — please choose a different time. Your entries are kept.'
    }
    if (error.status === 404 && mode === 'edit') {
      return 'This booking no longer exists — it may have been deleted by someone else. The list has been updated.'
    }
  }
  return error.message
}

/** User-facing message for a failed delete. */
export function describeDeleteError(error: Error): string {
  if (isApiError(error) && error.status === 404) {
    return 'This booking had already been deleted. The list has been updated.'
  }
  return `Could not delete the booking. ${error.message}`
}
