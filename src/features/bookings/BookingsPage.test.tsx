import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { installMockApi } from '../../test/mockApi'
import { server } from '../../test/mswServer'
import { renderWithProviders } from '../../test/render'
import { BookingsPage } from './BookingsPage'
import type { Booking } from './domain/types'

const NOW = new Date(2026, 9, 28, 10, 15) // Wednesday, 28 October 2026, 10:15 local

const seed: Booking[] = [
  { id: 't3', date: '2026-10-28', start: '13:00', end: '14:00', title: 'Design review' },
  { id: 't1', date: '2026-10-28', start: '09:00', end: '09:30', title: 'Daily standup' },
  { id: 't2', date: '2026-10-28', start: '10:00', end: '11:00' },
  { id: 'y1', date: '2026-10-27', start: '11:00', end: '12:00', title: 'Retrospective' },
  { id: 'n1', date: '2026-10-29', start: '10:00', end: '11:00', title: 'Sprint planning' },
]

function renderPage() {
  return renderWithProviders(<BookingsPage />, { now: NOW })
}

/** Rows of the booking list as plain text, in display order. */
function listRows(): string[] {
  return within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

beforeEach(() => {
  installMockApi({ seed, now: NOW })
})

describe('BookingsPage — loading and list', () => {
  it('shows a loading state, then today’s bookings sorted by start', async () => {
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Loading bookings…')
    expect(screen.getByRole('heading', { level: 2, name: 'Wednesday, 28 October 2026' })).toBeInTheDocument()

    await screen.findByRole('list')
    expect(listRows()).toEqual([
      '09:00–09:30Daily standupFinished',
      '10:00–11:00Untitled bookingIn progress',
      '13:00–14:00Design reviewEditDelete',
    ])
  })

  it('defaults the date input to today', () => {
    renderPage()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-28')
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled()
  })
})

describe('BookingsPage — changing the date', () => {
  it('loads bookings for the next day', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('list')

    await user.click(screen.getByRole('button', { name: /next day/i }))

    expect(screen.getByRole('heading', { level: 2, name: 'Thursday, 29 October 2026' })).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-29')
    await waitFor(() => expect(listRows()).toEqual(['10:00–11:00Sprint planningEditDelete']))
  })

  it('returns to today', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /next day/i }))
    await user.click(screen.getByRole('button', { name: /next day/i }))
    await user.click(screen.getByRole('button', { name: 'Today' }))

    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-28')
    await waitFor(() => expect(listRows()).toHaveLength(3))
  })

  it('accepts a date typed into the input', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-15' } })
    expect(await screen.findByText(/no bookings yet/i)).toHaveTextContent(
      'No bookings yet. The room is free from 09:00 to 18:00.',
    )
  })

  it('ignores an empty input value', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
    expect(screen.getByRole('heading', { level: 2, name: 'Wednesday, 28 October 2026' })).toBeInTheDocument()
  })
})

describe('BookingsPage — past dates', () => {
  it('shows past bookings with a read-only notice', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: /previous day/i }))

    expect(screen.getByText(/this date is in the past/i)).toBeInTheDocument()
    await waitFor(() => expect(listRows()).toEqual(['11:00–12:00RetrospectiveFinished']))
  })

  it('uses past-tense copy for an empty past date', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-01' } })
    expect(await screen.findByText('There were no bookings on this date.')).toBeInTheDocument()
  })

  it('does not show the notice for today', async () => {
    renderPage()
    await screen.findByRole('list')
    expect(screen.queryByText(/this date is in the past/i)).not.toBeInTheDocument()
  })
})

describe('BookingsPage — errors', () => {
  it('shows the server message and recovers on retry', async () => {
    let fail = true
    server.use(
      http.get('/api/bookings', () =>
        fail ? HttpResponse.json({ code: 'BOOM', message: 'Database unavailable.' }, { status: 500 }) : undefined,
      ),
    )
    const user = userEvent.setup()
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Could not load bookings. Database unavailable.')

    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(listRows()).toHaveLength(3))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains a network failure', async () => {
    server.use(http.get('/api/bookings', () => HttpResponse.error()))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i)
  })
})
