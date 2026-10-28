import { useId, useRef, useState } from 'react'
import { BookingForm } from './components/BookingForm'
import { BookingList } from './components/BookingList'
import { DateSelector } from './components/DateSelector'
import { WORKING_DAY_END, WORKING_DAY_START } from './domain/constants'
import { isPastDate } from './domain/rules'
import type { Booking, BookingDraft, DateString } from './domain/types'
import { describeDeleteError, describeSaveError } from './errors'
import { formatDateParts } from './format'
import { useBookingMutations } from './hooks/useBookingMutations'
import { useBookings } from './hooks/useBookings'
import { useNowSnapshot } from './hooks/useNowSnapshot'

const range = (booking: Pick<Booking, 'start' | 'end'>) => `${booking.start}–${booking.end}`

export function BookingsPage() {
  const now = useNowSnapshot()
  const [date, setDate] = useState(now.date)
  // A snapshot, not an id: if the booking disappears from a refreshed list
  // (deleted elsewhere → 404), the form stays in edit mode with the user's values.
  const [editing, setEditing] = useState<Booking | null>(null)
  const [announcement, setAnnouncement] = useState('')
  // After leaving edit mode, focus goes back to that booking (its Edit button or
  // timeline block). A new object each time, so repeating it for the same booking works.
  const [returnFocus, setReturnFocus] = useState<{ id: string } | null>(null)
  const query = useBookings(date)
  const { create, update, remove } = useBookingMutations(date)
  const headingId = useId()
  const listHeadingRef = useRef<HTMLHeadingElement>(null)

  const bookings = query.data ?? []
  const isPast = isPastDate(date, now)
  const isRefreshing = query.isFetching && !query.isPending
  const { weekday, dayMonthYear } = formatDateParts(date)
  const activeSave = editing ? update : create
  const saveError = activeSave.error ? describeSaveError(activeSave.error, editing ? 'edit' : 'create') : null

  function changeDate(next: DateString) {
    setDate(next)
    setEditing(null)
    setReturnFocus(null)
    setAnnouncement('')
    create.reset()
    update.reset()
    remove.reset()
  }

  function startEdit(booking: Booking) {
    setEditing(booking)
    setReturnFocus(null)
    setAnnouncement('')
    update.reset()
  }

  function cancelEdit() {
    setReturnFocus(editing ? { id: editing.id } : null)
    setEditing(null)
    update.reset()
  }

  /** A save error describes the values that were sent; once they change it is stale. */
  function clearSaveError() {
    if (activeSave.error) activeSave.reset()
  }

  async function save(draft: BookingDraft): Promise<boolean> {
    setAnnouncement('')
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, draft })
        setReturnFocus({ id: editing.id })
        setEditing(null)
        setAnnouncement(`Booking ${range(draft)} updated.`)
      } else {
        await create.mutateAsync(draft)
        setAnnouncement(`Booking ${range(draft)} created.`)
      }
      return true
    } catch {
      // The error is rendered from the mutation state; the form keeps its values.
      return false
    }
  }

  function deleteBooking(booking: Booking) {
    setAnnouncement('')
    remove.mutate(booking.id, {
      onSuccess: () => {
        if (editing?.id === booking.id) setEditing(null)
        setAnnouncement(`Booking ${range(booking)} deleted.`)
        // The focused button is gone with its row; continue from the list heading.
        listHeadingRef.current?.focus()
      },
    })
  }

  return (
    <div className="page">
      <header className="page__header">
        <h1>Meeting room booking</h1>
        <p className="muted">
          One room, working hours {WORKING_DAY_START}–{WORKING_DAY_END}. Bookings last 30 minutes to 2 hours.
        </p>
      </header>

      <DateSelector value={date} today={now.date} onChange={changeDate} />

      <p className="announcement" aria-live="polite">
        {announcement}
      </p>

      <div className="page__layout">
        <section className="panel" aria-labelledby={headingId} aria-busy={query.isFetching}>
          <div className="panel__header">
            <h2 id={headingId} ref={listHeadingRef} tabIndex={-1} className="date-heading">
              <span className="date-heading__weekday">{weekday},</span>{' '}
              <span className="date-heading__date">{dayMonthYear}</span>
            </h2>
            {isRefreshing && (
              <span className="muted" role="status">
                Updating…
              </span>
            )}
          </div>

          {isPast && (
            <p className="notice">This date is in the past. Bookings are shown for reference and cannot be changed.</p>
          )}

          {remove.error && (
            <p role="alert" className="form-error">
              {describeDeleteError(remove.error)}
            </p>
          )}

          <BookingList
            date={date}
            now={now}
            query={query}
            editingId={editing?.id ?? null}
            deletingId={remove.isPending ? remove.variables : null}
            onEdit={startEdit}
            onDelete={deleteBooking}
            returnFocus={returnFocus}
          />
        </section>

        {isPast ? (
          <section className="panel" aria-label="New booking">
            <p className="muted">Bookings cannot be created for past dates. Pick today or a later date.</p>
          </section>
        ) : (
          <BookingForm
            // A new date or a different booking starts a fresh form.
            key={`${date}:${editing?.id ?? 'new'}`}
            date={date}
            now={now}
            existing={bookings}
            editing={editing ?? undefined}
            isSubmitting={activeSave.isPending}
            serverError={saveError}
            onSubmit={save}
            onCancel={cancelEdit}
            onValuesChange={clearSaveError}
            onDelete={editing ? () => deleteBooking(editing) : undefined}
            isDeleting={remove.isPending && remove.variables === editing?.id}
          />
        )}
      </div>
    </div>
  )
}
