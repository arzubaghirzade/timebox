import type { DateString, NowSnapshot, TimeString } from './types'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const MINUTES_PER_DAY = 24 * 60

export function isValidTime(value: string): value is TimeString {
  return TIME_PATTERN.test(value)
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Checks the format and that the day exists in the calendar (no `2026-02-30`). */
export function isValidDate(value: string): value is DateString {
  const match = DATE_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** `"09:30"` → `570`. Throws on malformed input so bugs surface early. */
export function toMinutes(time: TimeString): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) throw new Error(`Invalid time: "${time}"`)
  return Number(match[1]) * 60 + Number(match[2])
}

/** `570` → `"09:30"`. Accepts 0–1439. */
export function fromMinutes(minutes: number): TimeString {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new Error(`Minutes out of range: ${minutes}`)
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

/** Local calendar date of `date`. Deliberately avoids `toISOString()`, which is UTC. */
export function toDateString(date: Date): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Local `Date` at midnight of a valid `YYYY-MM-DD` string. */
export function fromDateString(date: DateString): Date {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year ?? NaN, (month ?? NaN) - 1, day ?? NaN)
}

/** Calendar arithmetic on local dates; handles month/year rollover and DST. */
export function addDays(date: DateString, days: number): DateString {
  const result = fromDateString(date)
  result.setDate(result.getDate() + days)
  return toDateString(result)
}

export function toNowSnapshot(date: Date): NowSnapshot {
  return {
    date: toDateString(date),
    minutes: date.getHours() * 60 + date.getMinutes(),
  }
}
