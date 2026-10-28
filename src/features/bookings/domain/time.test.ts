import { describe, expect, it } from 'vitest'
import {
  addDays,
  fromDateString,
  fromMinutes,
  isValidDate,
  isValidTime,
  toDateString,
  toMinutes,
  toNowSnapshot,
} from './time'

describe('isValidTime', () => {
  it.each(['00:00', '09:00', '09:15', '18:00', '23:59'])('accepts %s', (value) => {
    expect(isValidTime(value)).toBe(true)
  })

  it.each(['', '9:00', '09:0', '24:00', '12:60', '09-00', '09:00:00', ' 09:00', 'ab:cd'])(
    'rejects %j',
    (value) => {
      expect(isValidTime(value)).toBe(false)
    },
  )
})

describe('isValidDate', () => {
  it.each(['2026-01-01', '2026-12-31', '2028-02-29', '2000-02-29'])('accepts %s', (value) => {
    expect(isValidDate(value)).toBe(true)
  })

  it.each([
    '',
    '2026-1-01',
    '2026-00-10',
    '2026-13-01',
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-01-00',
    '2026/01/01',
    '2026-01-01T00:00',
  ])('rejects %j', (value) => {
    expect(isValidDate(value)).toBe(false)
  })
})

describe('toMinutes / fromMinutes', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['09:30', 570],
    ['18:00', 1080],
    ['23:59', 1439],
  ] as const)('%s ⇄ %i', (time, minutes) => {
    expect(toMinutes(time)).toBe(minutes)
    expect(fromMinutes(minutes)).toBe(time)
  })

  it('throws on malformed time', () => {
    expect(() => toMinutes('9:00')).toThrow()
  })

  it.each([-1, 1440, 1.5])('throws on out-of-range minutes %s', (minutes) => {
    expect(() => fromMinutes(minutes)).toThrow()
  })
})

describe('toDateString / toNowSnapshot', () => {
  it('uses local calendar fields, not UTC', () => {
    // Constructed from local fields, so the result is the same in every time zone.
    const lateEvening = new Date(2026, 9, 28, 23, 45)
    expect(toDateString(lateEvening)).toBe('2026-10-28')
    expect(toNowSnapshot(lateEvening)).toEqual({ date: '2026-10-28', minutes: 23 * 60 + 45 })
  })

  it('pads month and day', () => {
    expect(toDateString(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('fromDateString / addDays', () => {
  it('parses to local midnight', () => {
    const date = fromDateString('2026-10-28')
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()]).toEqual([2026, 9, 28, 0])
  })

  it.each([
    ['2026-10-28', 1, '2026-10-29'],
    ['2026-10-28', -1, '2026-10-27'],
    ['2026-10-31', 1, '2026-11-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-28', 2, '2026-03-30'], // crosses the EU DST change
    ['2026-10-24', 2, '2026-10-26'], // and back
  ])('%s + %i → %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected)
  })
})
