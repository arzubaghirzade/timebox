import { useEffect, useRef, type CSSProperties } from 'react'
import type { Booking, NowSnapshot } from '../domain/types'
import { bookingStatus, STATUS_LABEL } from '../status'
import { timelineHours, timelinePosition, WORKING_DAY_MINUTES } from '../timeline'

type BookingTimelineProps = {
  bookings: readonly Booking[]
  now: NowSnapshot
  editingId: string | null
  /** A new object each time focus should return to a block (after cancel/save). */
  returnFocus: { id: string } | null
  onSelect: (booking: Booking) => void
}

/** Blocks at least this long show the title on its own line. */
const TALL_BLOCK_MINUTES = 60

const cssVars = (vars: Record<string, number>) => vars as CSSProperties

/**
 * Desktop presentation of one day: an hour rail and bookings positioned by
 * their real start and end. Blocks have fixed heights inside their own slot and
 * never grow, so neighbours can't overlap. Actions live in the edit form;
 * an editable block is a button that opens it.
 */
export function BookingTimeline({ bookings, now, editingId, returnFocus, onSelect }: BookingTimelineProps) {
  const blockRefs = useRef(new Map<string, HTMLButtonElement>())

  // Blocks stay mounted while the form is open, so focus is restored explicitly.
  useEffect(() => {
    if (returnFocus) blockRefs.current.get(returnFocus.id)?.focus()
  }, [returnFocus])

  return (
    <div className="timeline" style={cssVars({ '--day-minutes': WORKING_DAY_MINUTES })}>
      <div className="timeline__grid" aria-hidden="true">
        {timelineHours().map((hour, index) => (
          <div key={hour} className="timeline__hour" style={cssVars({ '--offset': index * 60 })}>
            <span className="timeline__hour-label">{hour}</span>
          </div>
        ))}
      </div>

      <ol className="timeline__track">
        {bookings.map((booking) => {
          const { offset, duration } = timelinePosition(booking)
          const status = bookingStatus(booking, now)
          const label = STATUS_LABEL[status]
          const isEditing = booking.id === editingId
          // Started (and past) bookings are read-only, so they are not interactive.
          const isEditable = status === 'upcoming'

          const className = [
            'timeline__block',
            `timeline__block--${status}`,
            duration >= TALL_BLOCK_MINUTES && 'timeline__block--tall',
            isEditing && 'timeline__block--editing',
          ]
            .filter(Boolean)
            .join(' ')

          const content = (
            <>
              {/* Spaces between the parts keep the button's accessible name readable. */}
              <span className="timeline__time">
                <time>{booking.start}</time>–<time>{booking.end}</time>
              </span>{' '}
              <span className={booking.title ? 'timeline__title' : 'timeline__title timeline__title--empty'}>
                {booking.title ?? 'Untitled booking'}
              </span>
              {label && <> <span className={`badge badge--${status}`}>{label}</span></>}
              {isEditing && <> <span className="badge badge--editing">Editing</span></>}
            </>
          )

          return (
            <li key={booking.id} className="timeline__item" style={cssVars({ '--offset': offset, '--duration': duration })}>
              {isEditable ? (
                <button
                  type="button"
                  ref={(node) => {
                    if (node) blockRefs.current.set(booking.id, node)
                    else blockRefs.current.delete(booking.id)
                  }}
                  className={className}
                  aria-current={isEditing ? 'true' : undefined}
                  onClick={() => onSelect(booking)}
                >
                  <span className="visually-hidden">Edit</span> {content}
                </button>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
