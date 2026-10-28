import type { UseQueryResult } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { WORKING_DAY_END, WORKING_DAY_START } from '../domain/constants'
import { hasEnded, hasStarted, isPastDate } from '../domain/rules'
import type { Booking, DateString, NowSnapshot } from '../domain/types'

type BookingListProps = {
  date: DateString
  now: NowSnapshot
  query: UseQueryResult<Booking[]>
  editingId: string | null
  /** Id of the booking whose delete request is in flight. */
  deletingId: string | null
  onEdit: (booking: Booking) => void
  onDelete: (booking: Booking) => void
  /** Booking whose Edit button should receive focus when it reappears (after leaving edit mode). */
  returnFocusId: string | null
}

function statusLabel(booking: Booking, now: NowSnapshot): string | null {
  if (hasEnded(booking, now)) return 'Finished'
  if (hasStarted(booking, now)) return 'In progress'
  return null
}

function describe(booking: Booking): string {
  const range = `${booking.start}–${booking.end}`
  return booking.title ? `${booking.title}, ${range}` : `booking ${range}`
}

export function BookingList({
  date,
  now,
  query,
  editingId,
  deletingId,
  onEdit,
  onDelete,
  returnFocusId,
}: BookingListProps) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  // After "Keep", focus returns to the Delete button that opened the confirmation.
  const [keptId, setKeptId] = useState<string | null>(null)

  // The action buttons below swap in and out of the DOM; `autoFocus` (applied on
  // mount) keeps keyboard focus on the matching control instead of dropping it
  // to <body>. The keyed fragments force a remount, so React does not reuse one
  // group's <button> for the other.

  if (query.isPending) {
    return (
      <p role="status" className="state">
        Loading bookings…
      </p>
    )
  }

  if (query.isError) {
    return (
      <div role="alert" className="state state--error">
        <p>Could not load bookings. {query.error.message}</p>
        <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    )
  }

  if (query.data.length === 0) {
    return (
      <p className="state">
        {isPastDate(date, now)
          ? 'There were no bookings on this date.'
          : `No bookings yet. The room is free from ${WORKING_DAY_START} to ${WORKING_DAY_END}.`}
      </p>
    )
  }

  return (
    <ol className="booking-list">
      {query.data.map((booking) => {
        const status = statusLabel(booking, now)
        // Past and already-started bookings are read-only.
        const canModify = !hasStarted(booking, now)
        const isEditing = booking.id === editingId
        const isDeleting = booking.id === deletingId
        const isConfirming = booking.id === confirmingId

        return (
          <li key={booking.id} className={isEditing ? 'booking booking--editing' : 'booking'}>
            <span className="booking__time">
              <time>{booking.start}</time>–<time>{booking.end}</time>
            </span>
            <span className={booking.title ? 'booking__title' : 'booking__title booking__title--empty'}>
              {booking.title ?? 'Untitled booking'}
            </span>
            {status && <span className="badge">{status}</span>}
            {isEditing && <span className="badge badge--accent">Editing</span>}

            {canModify && !isEditing && (
              <span className="booking__actions">
                {isConfirming || isDeleting ? (
                  <Fragment key="confirm">
                    <span className="booking__confirm-text">Delete this booking?</span>
                    <button
                      type="button"
                      className="button--danger"
                      disabled={isDeleting}
                      aria-label={`Confirm delete ${describe(booking)}`}
                      onClick={() => {
                        setConfirmingId(null)
                        onDelete(booking)
                      }}
                    >
                      {isDeleting ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      disabled={isDeleting}
                      aria-label={`Keep ${describe(booking)}`}
                      // The safe choice gets focus, so a repeated Enter does not delete.
                      autoFocus
                      onClick={() => {
                        setConfirmingId(null)
                        setKeptId(booking.id)
                      }}
                    >
                      Keep
                    </button>
                  </Fragment>
                ) : (
                  <Fragment key="actions">
                    <button
                      type="button"
                      aria-label={`Edit ${describe(booking)}`}
                      autoFocus={booking.id === returnFocusId}
                      onClick={() => onEdit(booking)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${describe(booking)}`}
                      autoFocus={booking.id === keptId}
                      onClick={() => {
                        setKeptId(null)
                        setConfirmingId(booking.id)
                      }}
                    >
                      Delete
                    </button>
                  </Fragment>
                )}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
