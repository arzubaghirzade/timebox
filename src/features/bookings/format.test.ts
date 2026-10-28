import { describe, expect, it } from 'vitest'
import { formatDateLong } from './format'

describe('formatDateLong', () => {
  it.each([
    ['2026-10-28', 'Wednesday, 28 October 2026'],
    ['2026-01-01', 'Thursday, 1 January 2026'],
    ['2028-02-29', 'Tuesday, 29 February 2028'],
  ])('%s → %s', (date, expected) => {
    expect(formatDateLong(date)).toBe(expected)
  })
})
