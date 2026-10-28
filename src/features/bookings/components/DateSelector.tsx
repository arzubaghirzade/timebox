import { useId } from 'react'
import { addDays, isValidDate } from '../domain/time'
import type { DateString } from '../domain/types'

type DateSelectorProps = {
  value: DateString
  today: DateString
  onChange: (date: DateString) => void
}

export function DateSelector({ value, today, onChange }: DateSelectorProps) {
  const inputId = useId()

  return (
    <div className="date-selector" role="group" aria-label="Choose a date">
      <div className="field">
        <label htmlFor={inputId}>Date</label>
        <input
          id={inputId}
          type="date"
          value={value}
          onChange={(event) => {
            // Ignore the empty value some browsers emit while the user is mid-edit.
            if (isValidDate(event.target.value)) onChange(event.target.value)
          }}
        />
      </div>
      <div className="date-selector__nav">
        <button type="button" onClick={() => onChange(addDays(value, -1))}>
          <span aria-hidden="true">←</span> Previous day
        </button>
        <button type="button" onClick={() => onChange(today)} disabled={value === today}>
          Today
        </button>
        <button type="button" onClick={() => onChange(addDays(value, 1))}>
          Next day <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  )
}
