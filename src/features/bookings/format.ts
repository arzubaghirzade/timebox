import { fromDateString } from './domain/time'
import type { DateString } from './domain/types'

// Built by hand rather than with Intl: Intl punctuation varies between ICU
// versions (browsers vs Node), which would make labels and tests unstable.
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `2026-10-28` → `{ weekday: 'Wednesday', dayMonthYear: '28 October 2026' }`. */
export function formatDateParts(date: DateString): { weekday: string; dayMonthYear: string } {
  const value = fromDateString(date)
  return {
    weekday: WEEKDAYS[value.getDay()] ?? '',
    dayMonthYear: `${value.getDate()} ${MONTHS[value.getMonth()]} ${value.getFullYear()}`,
  }
}

/** `2026-10-28` → `Wednesday, 28 October 2026`. */
export function formatDateLong(date: DateString): string {
  const { weekday, dayMonthYear } = formatDateParts(date)
  return `${weekday}, ${dayMonthYear}`
}
