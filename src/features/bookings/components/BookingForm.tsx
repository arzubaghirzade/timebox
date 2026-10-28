import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { WORKING_DAY_END, WORKING_DAY_START } from '../domain/constants'
import { normalizeTitle } from '../domain/rules'
import { fromMinutes, toMinutes } from '../domain/time'
import type { Booking, BookingDraft, BookingField, DateString, NowSnapshot } from '../domain/types'
import { validateBooking } from '../domain/validateBooking'
import { formatDateLong } from '../format'

type FormValues = { start: string; end: string; title: string }
type EditableField = Exclude<BookingField, 'date'>

const EMPTY_VALUES: FormValues = { start: '', end: '', title: '' }
const NOT_TOUCHED: Record<EditableField, boolean> = { start: false, end: false, title: false }
const FIELD_ORDER: EditableField[] = ['start', 'end', 'title']

type BookingFormProps = {
  /** The booking date is fixed to the selected date, also when editing. */
  date: DateString
  now: NowSnapshot
  /** Bookings already on `date`, for the client-side overlap check. */
  existing: readonly Booking[]
  /** Present in edit mode. */
  editing?: Booking
  isSubmitting: boolean
  /** Message of the last failed save; the entered values are kept. */
  serverError: string | null
  /** Resolves `true` when saved. */
  onSubmit: (draft: BookingDraft) => Promise<boolean>
  onCancel?: () => void
  /** Called on every edit, e.g. to clear a server error that no longer applies. */
  onValuesChange?: () => void
  /** Edit mode only: deletes the booking being edited (after an inline confirmation). */
  onDelete?: () => void
  isDeleting?: boolean
}

export function BookingForm({
  date,
  now,
  existing,
  editing,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
  onValuesChange,
  onDelete,
  isDeleting = false,
}: BookingFormProps) {
  const id = useId()
  const fieldId = (field: EditableField) => `${id}-${field}`
  const errorId = (field: EditableField) => `${id}-${field}-error`

  const [values, setValues] = useState<FormValues>(() =>
    editing ? { start: editing.start, end: editing.end, title: editing.title ?? '' } : EMPTY_VALUES,
  )
  const [touched, setTouched] = useState(NOT_TOUCHED)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // After "Keep", focus returns to the Delete button (see the keyed fragments below).
  const [keptBooking, setKeptBooking] = useState(false)

  const formErrorRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLInputElement>(null)

  // Entering edit mode moves focus into the form.
  useEffect(() => {
    if (editing) startRef.current?.focus()
  }, [editing])

  // A failed save (e.g. 409) is announced and focused so keyboard and screen reader users notice it.
  useEffect(() => {
    if (serverError) formErrorRef.current?.focus()
  }, [serverError])

  const draft = useMemo<BookingDraft>(() => {
    const title = normalizeTitle(values.title)
    return title === undefined
      ? { date, start: values.start, end: values.end }
      : { date, start: values.start, end: values.end, title }
  }, [date, values])

  const validation = useMemo(
    () => validateBooking(draft, { existing, now, excludeId: editing?.id }),
    [draft, existing, now, editing?.id],
  )

  const fieldError = (field: EditableField) =>
    submitAttempted || touched[field] ? validation.fieldErrors[field]?.message : undefined
  // Overlap is shown once both times have been entered, before submitting.
  const showFormErrors = submitAttempted || (touched.start && touched.end)
  const formErrors = showFormErrors ? validation.formErrors : []

  const setValue = (field: EditableField, value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    onValuesChange?.()
  }
  const touch = (field: EditableField) => setTouched((t) => (t[field] ? t : { ...t, [field]: true }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitAttempted(true)

    if (!validation.isValid) {
      const firstInvalid = FIELD_ORDER.find((field) => validation.fieldErrors[field])
      if (firstInvalid) document.getElementById(fieldId(firstInvalid))?.focus()
      else formErrorRef.current?.focus()
      return
    }

    const saved = await onSubmit(draft)
    if (saved && !editing) {
      setValues(EMPTY_VALUES)
      setTouched(NOT_TOUCHED)
      setSubmitAttempted(false)
    }
  }

  // Native pickers get the same bounds the rules enforce.
  const earliestStart =
    date === now.date ? fromMinutes(Math.max(toMinutes(WORKING_DAY_START), now.minutes)) : WORKING_DAY_START

  const heading = editing ? 'Edit booking' : 'New booking'
  const headingId = `${id}-heading`

  return (
    <form className="panel booking-form" aria-labelledby={headingId} noValidate onSubmit={handleSubmit}>
      <div>
        <h2 id={headingId}>{heading}</h2>
        <p className="muted">{formatDateLong(date)}</p>
      </div>

      <div className="booking-form__times">
        <Field id={fieldId('start')} label="Start time" error={fieldError('start')} errorId={errorId('start')}>
          <input
            ref={startRef}
            id={fieldId('start')}
            type="time"
            required
            min={earliestStart}
            max={WORKING_DAY_END}
            value={values.start}
            onChange={(event) => setValue('start', event.target.value)}
            onBlur={() => touch('start')}
            aria-invalid={fieldError('start') ? true : undefined}
            aria-describedby={fieldError('start') ? errorId('start') : undefined}
          />
        </Field>

        <Field id={fieldId('end')} label="End time" error={fieldError('end')} errorId={errorId('end')}>
          <input
            id={fieldId('end')}
            type="time"
            required
            min={WORKING_DAY_START}
            max={WORKING_DAY_END}
            value={values.end}
            onChange={(event) => setValue('end', event.target.value)}
            onBlur={() => touch('end')}
            aria-invalid={fieldError('end') ? true : undefined}
            aria-describedby={fieldError('end') ? errorId('end') : undefined}
          />
        </Field>
      </div>

      <Field id={fieldId('title')} label="Title (optional)" error={fieldError('title')} errorId={errorId('title')}>
        <input
          id={fieldId('title')}
          type="text"
          value={values.title}
          onChange={(event) => setValue('title', event.target.value)}
          onBlur={() => touch('title')}
          autoComplete="off"
        />
      </Field>

      {(formErrors.length > 0 || serverError) && (
        <div ref={formErrorRef} tabIndex={-1} role="alert" className="form-error">
          {/* The server's explanation first: it says what happened; the overlap line says with what. */}
          {serverError && <p>{serverError}</p>}
          {formErrors.map((issue) => (
            <p key={issue.code}>{issue.message}</p>
          ))}
        </div>
      )}

      <div className="booking-form__actions">
        <button type="submit" className="button--primary" disabled={isSubmitting || isDeleting}>
          {isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create booking'}
        </button>
        {editing && onCancel && (
          <button type="button" onClick={onCancel} disabled={isSubmitting || isDeleting}>
            Cancel
          </button>
        )}
      </div>

      {editing && onDelete && (
        // Keyed fragments remount the buttons, so `autoFocus` moves focus between the two states.
        <div className="booking-form__delete">
          {confirmingDelete || isDeleting ? (
            <Fragment key="confirm">
              <span className="booking-form__confirm-text">Delete this booking?</span>
              <button
                type="button"
                className="button--danger"
                disabled={isDeleting}
                onClick={() => {
                  setConfirmingDelete(false)
                  onDelete()
                }}
              >
                {isDeleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                // The safe choice gets focus, so a repeated Enter does not delete.
                autoFocus
                onClick={() => {
                  setConfirmingDelete(false)
                  setKeptBooking(true)
                }}
              >
                Keep booking
              </button>
            </Fragment>
          ) : (
            <Fragment key="delete">
              <button
                type="button"
                className="button--danger-quiet"
                disabled={isSubmitting}
                autoFocus={keptBooking}
                onClick={() => {
                  setKeptBooking(false)
                  setConfirmingDelete(true)
                }}
              >
                Delete booking
              </button>
            </Fragment>
          )}
        </div>
      )}
    </form>
  )
}

type FieldProps = {
  id: string
  label: string
  error: string | undefined
  errorId: string
  children: ReactNode
}

function Field({ id, label, error, errorId, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p id={errorId} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
