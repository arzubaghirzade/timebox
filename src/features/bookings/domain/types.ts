/** Calendar date in local time, formatted `YYYY-MM-DD`. */
export type DateString = string

/** Wall-clock time, formatted `HH:mm` (24h). */
export type TimeString = string

export type Booking = {
  id: string
  date: DateString
  start: TimeString
  end: TimeString
  title?: string
}

/** A booking as entered by the user, before the server assigns an id. */
export type BookingDraft = Omit<Booking, 'id'>

/**
 * The current moment reduced to the two values the rules need.
 * Built from a `Date` with local getters so comparisons never depend on UTC.
 */
export type NowSnapshot = {
  date: DateString
  minutes: number
}

export type BookingField = 'date' | 'start' | 'end' | 'title'

export type ValidationCode =
  | 'INVALID_DATE'
  | 'INVALID_TIME'
  | 'PAST_DATE'
  | 'PAST_TIME'
  | 'OUTSIDE_WORKING_HOURS'
  | 'END_NOT_AFTER_START'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'OVERLAP'

export type ValidationIssue = {
  code: ValidationCode
  message: string
  /** `null` for form-level issues such as an overlap. */
  field: BookingField | null
  /** Set for `OVERLAP`: the existing booking the draft collides with. */
  conflictWith?: Booking
}
