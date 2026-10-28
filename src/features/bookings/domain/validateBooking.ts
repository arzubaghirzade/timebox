import {
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  WORKING_DAY_END,
  WORKING_DAY_START,
} from './constants'
import {
  durationMinutes,
  findConflict,
  isEndWithinWorkingHours,
  isPastDate,
  isPastTimeToday,
  isStartWithinWorkingHours,
} from './rules'
import { isValidDate, isValidTime } from './time'
import type { Booking, BookingDraft, BookingField, NowSnapshot, ValidationIssue } from './types'

export type ValidationContext = {
  /** Known bookings; may include other dates, only the draft's date is checked. */
  existing: readonly Booking[]
  now: NowSnapshot
  /** Id of the booking being edited, so it does not conflict with itself. */
  excludeId?: string
}

export type ValidationResult = {
  isValid: boolean
  /** Every issue found, in field order. */
  issues: ValidationIssue[]
  /** First issue per field — what the form shows next to each input. */
  fieldErrors: Partial<Record<BookingField, ValidationIssue>>
  /** Issues not tied to one field (overlap). */
  formErrors: ValidationIssue[]
}

const WORKING_HOURS_LABEL = `${WORKING_DAY_START}–${WORKING_DAY_END}`

function formatRange(booking: Booking): string {
  const range = `${booking.start}–${booking.end}`
  return booking.title ? `${range} (${booking.title})` : range
}

/**
 * Applies every business rule to a draft. Pure and deterministic: the clock
 * and the existing bookings are passed in, so the same function serves the
 * form and the mock server.
 */
export function validateBooking(draft: BookingDraft, context: ValidationContext): ValidationResult {
  const issues: ValidationIssue[] = []
  const add = (issue: ValidationIssue) => issues.push(issue)

  const dateOk = isValidDate(draft.date)
  const startOk = isValidTime(draft.start)
  const endOk = isValidTime(draft.end)

  // Date
  if (!dateOk) {
    add({ code: 'INVALID_DATE', field: 'date', message: 'Enter a valid date.' })
  } else if (isPastDate(draft.date, context.now)) {
    add({ code: 'PAST_DATE', field: 'date', message: 'Bookings cannot be made for past dates.' })
  }

  // Start
  if (!startOk) {
    add({ code: 'INVALID_TIME', field: 'start', message: 'Enter a valid start time.' })
  } else {
    if (!isStartWithinWorkingHours(draft.start)) {
      add({
        code: 'OUTSIDE_WORKING_HOURS',
        field: 'start',
        message: `Start must be within working hours (${WORKING_HOURS_LABEL}).`,
      })
    }
    if (dateOk && isPastTimeToday(draft.date, draft.start, context.now)) {
      add({ code: 'PAST_TIME', field: 'start', message: 'Start time has already passed.' })
    }
  }

  // End
  if (!endOk) {
    add({ code: 'INVALID_TIME', field: 'end', message: 'Enter a valid end time.' })
  } else if (!isEndWithinWorkingHours(draft.end)) {
    add({
      code: 'OUTSIDE_WORKING_HOURS',
      field: 'end',
      message: `End must be within working hours (${WORKING_HOURS_LABEL}).`,
    })
  }

  // Duration
  const duration = startOk && endOk ? durationMinutes(draft.start, draft.end) : null
  if (duration !== null) {
    if (duration <= 0) {
      add({ code: 'END_NOT_AFTER_START', field: 'end', message: 'End must be after start.' })
    } else if (duration < MIN_DURATION_MINUTES) {
      add({
        code: 'TOO_SHORT',
        field: 'end',
        message: `Booking must be at least ${MIN_DURATION_MINUTES} minutes.`,
      })
    } else if (duration > MAX_DURATION_MINUTES) {
      add({
        code: 'TOO_LONG',
        field: 'end',
        message: `Booking cannot be longer than ${MAX_DURATION_MINUTES} minutes.`,
      })
    }
  }

  // Overlap — only meaningful once the date and range are well-formed.
  if (dateOk && duration !== null && duration > 0) {
    const conflict = findConflict(draft, context.existing, context.excludeId)
    if (conflict) {
      add({
        code: 'OVERLAP',
        field: null,
        message: `Overlaps with an existing booking ${formatRange(conflict)}.`,
        conflictWith: conflict,
      })
    }
  }

  const fieldErrors: ValidationResult['fieldErrors'] = {}
  for (const issue of issues) {
    if (issue.field && !fieldErrors[issue.field]) fieldErrors[issue.field] = issue
  }

  return {
    isValid: issues.length === 0,
    issues,
    fieldErrors,
    formErrors: issues.filter((issue) => issue.field === null),
  }
}
