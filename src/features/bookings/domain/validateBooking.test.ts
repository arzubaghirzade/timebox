import { describe, expect, it } from 'vitest'
import type { Booking, BookingDraft, NowSnapshot, ValidationCode } from './types'
import { validateBooking, type ValidationContext } from './validateBooking'

const TODAY = '2026-10-28'
const TOMORROW = '2026-10-29'

const now: NowSnapshot = { date: TODAY, minutes: 10 * 60 + 15 } // 10:15

const existing: Booking[] = [
  { id: 'a', date: TOMORROW, start: '10:00', end: '11:00', title: 'Standup' },
  { id: 'b', date: TOMORROW, start: '14:00', end: '15:30' },
]

const context: ValidationContext = { existing, now }

const draft = (overrides: Partial<BookingDraft> = {}): BookingDraft => ({
  date: TOMORROW,
  start: '12:00',
  end: '13:00',
  ...overrides,
})

const codes = (d: BookingDraft, ctx: ValidationContext = context): ValidationCode[] =>
  validateBooking(d, ctx).issues.map((issue) => issue.code)

describe('validateBooking — valid drafts', () => {
  it.each([
    ['plain hour', draft()],
    ['starts at opening', draft({ start: '09:00', end: '09:30' })],
    ['ends at closing', draft({ start: '17:30', end: '18:00' })],
    ['exactly 30 minutes', draft({ start: '12:00', end: '12:30' })],
    ['exactly 2 hours', draft({ start: '11:00', end: '13:00' })],
    ['adjacent after existing', draft({ start: '11:00', end: '12:00' })],
    ['adjacent before existing', draft({ start: '09:00', end: '10:00' })],
    ['fills gap up to next booking', draft({ start: '12:00', end: '14:00' })],
    ['non-quarter minutes', draft({ start: '09:07', end: '09:41' })],
    ['ends one minute before closing', draft({ start: '16:59', end: '17:59' })],
    ['today, starting now', draft({ date: TODAY, start: '10:15', end: '11:00' })],
    ['with title', draft({ title: 'Planning' })],
    ['with a very long title', draft({ title: 'x'.repeat(500) })],
  ])('%s', (_label, d) => {
    const result = validateBooking(d, context)
    expect(result.issues).toEqual([])
    expect(result.isValid).toBe(true)
  })
})

describe('validateBooking — working hours', () => {
  it.each([
    ['start before opening', draft({ start: '08:30', end: '09:30' }), 'start'],
    ['start at closing', draft({ start: '18:00', end: '18:30' }), 'start'],
    ['end at opening', draft({ start: '08:30', end: '09:00' }), 'end'],
    ['end after closing', draft({ start: '17:00', end: '18:15' }), 'end'],
  ] as const)('%s → OUTSIDE_WORKING_HOURS on %s', (_label, d, field) => {
    const result = validateBooking(d, context)
    expect(result.fieldErrors[field]?.code).toBe('OUTSIDE_WORKING_HOURS')
  })
})

describe('validateBooking — start < end', () => {
  it.each([
    ['equal', draft({ start: '12:00', end: '12:00' })],
    ['reversed', draft({ start: '13:00', end: '12:00' })],
  ])('%s → END_NOT_AFTER_START', (_label, d) => {
    expect(validateBooking(d, context).fieldErrors.end?.code).toBe('END_NOT_AFTER_START')
  })
})

describe('validateBooking — duration', () => {
  it.each([
    ['29 minutes', '12:00', '12:29', 'TOO_SHORT'],
    ['15 minutes', '12:00', '12:15', 'TOO_SHORT'],
    ['2h 1m', '12:00', '14:01', 'TOO_LONG'],
    ['3 hours', '09:00', '12:00', 'TOO_LONG'],
  ] as const)('%s → %s', (_label, start, end, code) => {
    expect(codes(draft({ start, end }))).toContain(code)
  })
})

describe('validateBooking — overlap', () => {
  it.each([
    ['overlaps start', '09:30', '10:30'],
    ['overlaps end', '10:30', '11:30'],
    ['contained', '10:15', '10:45'],
    ['identical', '10:00', '11:00'],
    ['spans two bookings', '13:30', '15:00'],
  ])('%s → OVERLAP', (_label, start, end) => {
    const result = validateBooking(draft({ start, end }), context)
    expect(result.formErrors.map((issue) => issue.code)).toEqual(['OVERLAP'])
    expect(result.formErrors[0]?.conflictWith).toBeDefined()
  })

  it('names the conflicting booking in the message', () => {
    const [issue] = validateBooking(draft({ start: '10:30', end: '11:30' }), context).formErrors
    expect(issue?.message).toBe('Overlaps with an existing booking 10:00–11:00 (Standup).')
    expect(issue?.conflictWith?.id).toBe('a')
  })

  it('ignores bookings on other dates', () => {
    expect(codes(draft({ date: '2026-10-30', start: '10:00', end: '11:00' }))).toEqual([])
  })

  it('uses a minutes-based message for the maximum duration', () => {
    const result = validateBooking(draft({ start: '12:00', end: '14:30' }), context)
    expect(result.fieldErrors.end?.message).toBe('Booking cannot be longer than 120 minutes.')
  })

  it('skips the overlap check when the date is invalid', () => {
    expect(codes(draft({ date: 'nope', start: '10:00', end: '11:00' }))).toEqual(['INVALID_DATE'])
  })

  it('skips the overlap check when the range itself is invalid', () => {
    expect(codes(draft({ start: '11:00', end: '10:00' }))).toEqual(['END_NOT_AFTER_START'])
  })
})

describe('validateBooking — editing', () => {
  it('does not conflict with the booking being edited', () => {
    const edit = draft({ start: '10:00', end: '11:30' })
    expect(codes(edit)).toContain('OVERLAP')
    expect(codes(edit, { ...context, excludeId: 'a' })).toEqual([])
  })

  it('still conflicts with other bookings', () => {
    const edit = draft({ start: '13:30', end: '14:30' })
    expect(codes(edit, { ...context, excludeId: 'a' })).toEqual(['OVERLAP'])
  })
})

describe('validateBooking — past', () => {
  it('rejects a past date', () => {
    const result = validateBooking(draft({ date: '2026-10-27' }), context)
    expect(result.fieldErrors.date?.code).toBe('PAST_DATE')
  })

  it('does not also report PAST_TIME for a past date', () => {
    expect(codes(draft({ date: '2026-10-27', start: '09:00', end: '10:00' }))).toEqual(['PAST_DATE'])
  })

  it.each([
    ['09:00', '10:00'],
    ['10:00', '11:00'],
    ['10:14', '11:00'],
  ])('rejects today %s–%s (now 10:15)', (start, end) => {
    const result = validateBooking(draft({ date: TODAY, start, end }), context)
    expect(result.fieldErrors.start?.code).toBe('PAST_TIME')
  })

  it('allows later today', () => {
    expect(codes(draft({ date: TODAY, start: '16:00', end: '17:00' }))).toEqual([])
  })
})

describe('validateBooking — format', () => {
  it.each([
    ['bad date', draft({ date: '2026-02-30' }), 'date'],
    ['empty date', draft({ date: '' }), 'date'],
    ['bad start', draft({ start: '9:00' }), 'start'],
    ['empty end', draft({ end: '' }), 'end'],
  ] as const)('%s → error on %s', (_label, d, field) => {
    const result = validateBooking(d, context)
    expect(result.isValid).toBe(false)
    expect(result.fieldErrors[field]?.code).toMatch(/^INVALID_/)
  })

  it('reports independent field errors together', () => {
    const result = validateBooking({ date: 'x', start: 'y', end: 'z' }, context)
    expect(Object.keys(result.fieldErrors).sort()).toEqual(['date', 'end', 'start'])
    expect(result.formErrors).toEqual([])
  })
})

describe('validateBooking — field error priority', () => {
  it('shows the first issue per field while keeping all issues', () => {
    // End is both outside working hours and makes the booking too long.
    const result = validateBooking(draft({ start: '16:00', end: '18:30' }), context)
    expect(result.fieldErrors.end?.code).toBe('OUTSIDE_WORKING_HOURS')
    expect(result.issues.map((issue) => issue.code)).toEqual(['OUTSIDE_WORKING_HOURS', 'TOO_LONG'])
  })
})
