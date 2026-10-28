import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { BookingStore } from '../../mocks/store'
import { installMockApi } from '../../test/mockApi'
import { server } from '../../test/mswServer'
import { renderWithProviders } from '../../test/render'
import { BookingsPage } from './BookingsPage'
import type { Booking } from './domain/types'

const NOW = new Date(2026, 9, 28, 10, 15) // Wednesday, 28 October 2026, 10:15 local

const seed: Booking[] = [
  { id: 't1', date: '2026-10-28', start: '09:00', end: '09:30', title: 'Daily standup' },
  { id: 't2', date: '2026-10-28', start: '10:00', end: '11:00' },
  { id: 't3', date: '2026-10-28', start: '13:00', end: '14:00', title: 'Design review' },
  { id: 'y1', date: '2026-10-27', start: '11:00', end: '12:00', title: 'Retrospective' },
]

let store: BookingStore
let user: UserEvent

beforeEach(() => {
  ;({ store } = installMockApi({ seed, now: NOW }))
  user = userEvent.setup()
})

async function renderPage() {
  renderWithProviders(<BookingsPage />, { now: NOW })
  await screen.findByRole('list')
}

const form = (name: 'New booking' | 'Edit booking' = 'New booking') => screen.getByRole('form', { name })
const startInput = () => screen.getByLabelText('Start time')
const endInput = () => screen.getByLabelText('End time')
const titleInput = () => screen.getByLabelText('Title (optional)')

async function fill({ start, end, title }: { start?: string; end?: string; title?: string }) {
  if (start !== undefined) {
    await user.clear(startInput())
    await user.type(startInput(), start)
  }
  if (end !== undefined) {
    await user.clear(endInput())
    await user.type(endInput(), end)
  }
  if (title !== undefined) {
    await user.clear(titleInput())
    await user.type(titleInput(), title)
  }
  await user.tab() // blur the last field
}

const rowFor = (text: string) => {
  const row = screen.getAllByRole('listitem').find((item) => item.textContent?.includes(text))
  if (!row) throw new Error(`No row containing "${text}"`)
  return row
}

describe('create', () => {
  it('creates a booking, refreshes the list and resets the form', async () => {
    await renderPage()

    await fill({ start: '11:00', end: '12:00', title: '  Planning  ' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    expect(await screen.findByText('Booking 11:00–12:00 created.')).toBeInTheDocument()
    expect(rowFor('11:00–12:00')).toHaveTextContent('Planning')
    expect(startInput()).toHaveValue('')
    expect(endInput()).toHaveValue('')
    expect(titleInput()).toHaveValue('')
    expect(store.all().find((b) => b.date === '2026-10-28' && b.start === '11:00')).toMatchObject({
      end: '12:00',
      title: 'Planning',
    })
  })

  it('allows a booking adjacent to existing ones', async () => {
    await renderPage()
    await fill({ start: '14:00', end: '15:00' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))
    expect(await screen.findByText('Booking 14:00–15:00 created.')).toBeInTheDocument()
  })

  it('creates on the selected date', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: /next day/i }))
    await screen.findByText(/no bookings yet/i)

    await fill({ start: '09:00', end: '10:00' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    await screen.findByText('Booking 09:00–10:00 created.')
    expect(store.all().find((b) => b.date === '2026-10-29')).toMatchObject({ start: '09:00', end: '10:00' })
  })
})

describe('client-side validation', () => {
  it('shows errors on submit, focuses the first invalid field and sends nothing', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    expect(screen.getByText('Enter a valid start time.')).toBeInTheDocument()
    expect(screen.getByText('Enter a valid end time.')).toBeInTheDocument()
    expect(startInput()).toHaveFocus()
    expect(startInput()).toHaveAttribute('aria-invalid', 'true')
    expect(startInput()).toHaveAccessibleDescription('Enter a valid start time.')
    expect(store.all()).toHaveLength(seed.length)
  })

  it('does not show errors before a field is touched', async () => {
    await renderPage()
    expect(screen.queryByText(/enter a valid/i)).not.toBeInTheDocument()
  })

  it.each([
    ['12:00', '12:15', 'Booking must be at least 30 minutes.'],
    ['11:00', '13:30', 'Booking cannot be longer than 120 minutes.'],
    ['12:00', '11:00', 'End must be after start.'],
    ['17:00', '18:30', 'End must be within working hours (09:00–18:00).'],
  ])('%s–%s → "%s"', async (start, end, message) => {
    await renderPage()
    await fill({ start, end })
    expect(within(form()).getByText(message)).toBeInTheDocument()
  })

  it('rejects a start time that has already passed today', async () => {
    await renderPage()
    await fill({ start: '10:00', end: '10:45' })
    expect(screen.getByText('Start time has already passed.')).toBeInTheDocument()
  })

  it('shows an overlap before submitting and blocks the request', async () => {
    await renderPage()
    await fill({ start: '13:30', end: '14:30' })

    expect(within(form()).getByRole('alert')).toHaveTextContent(
      'Overlaps with an existing booking 13:00–14:00 (Design review).',
    )

    await user.click(screen.getByRole('button', { name: 'Create booking' }))
    expect(within(form()).getByRole('alert')).toHaveFocus()
    expect(store.all()).toHaveLength(seed.length)
  })
})

describe('read-only rules', () => {
  it('hides Edit and Delete for bookings that have started', async () => {
    await renderPage()
    for (const text of ['Daily standup', '10:00–11:00']) {
      expect(within(rowFor(text)).queryByRole('button')).not.toBeInTheDocument()
    }
    expect(within(rowFor('Design review')).getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('replaces the form and hides all actions on a past date', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: /previous day/i }))
    await screen.findByText('Retrospective')

    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(screen.getByText(/bookings cannot be created for past dates/i)).toBeInTheDocument()
    expect(within(screen.getByRole('list')).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('edit', () => {
  it('prefills the form, keeps the booking from conflicting with itself and saves', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' }))

    expect(form('Edit booking')).toBeInTheDocument()
    expect(startInput()).toHaveValue('13:00')
    expect(endInput()).toHaveValue('14:00')
    expect(titleInput()).toHaveValue('Design review')
    expect(startInput()).toHaveFocus()
    expect(within(rowFor('Design review')).getByText('Editing')).toBeInTheDocument()

    // Extending into its own original slot is fine.
    await fill({ end: '14:30' })
    expect(within(form('Edit booking')).queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Booking 13:00–14:30 updated.')).toBeInTheDocument()
    expect(form('New booking')).toBeInTheDocument()
    await waitFor(() => expect(rowFor('Design review')).toHaveTextContent('13:00–14:30'))
    expect(store.get('t3')).toMatchObject({ date: '2026-10-28', start: '13:00', end: '14:30' })
  })

  it('still detects overlap with other bookings', async () => {
    store.insert({ date: '2026-10-28', start: '15:00', end: '16:00', title: 'Interview' })
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    await fill({ start: '14:30', end: '15:30' })
    expect(within(form('Edit booking')).getByRole('alert')).toHaveTextContent(/Interview/)
  })

  it('cancels without saving', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    await fill({ title: 'Changed' })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(form('New booking')).toBeInTheDocument()
    expect(titleInput()).toHaveValue('')
    expect(store.get('t3')?.title).toBe('Design review')
  })

  it('leaves edit mode when the date changes', async () => {
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    await user.click(screen.getByRole('button', { name: /next day/i }))
    expect(form('New booking')).toBeInTheDocument()
  })
})

describe('delete', () => {
  it('asks for confirmation, can be kept, then deletes', async () => {
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Delete Design review, 13:00–14:00' }))
    expect(within(rowFor('Design review')).getByText('Delete this booking?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Keep Design review, 13:00–14:00' }))
    expect(within(rowFor('Design review')).queryByText('Delete this booking?')).not.toBeInTheDocument()
    expect(store.get('t3')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Delete Design review, 13:00–14:00' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete Design review, 13:00–14:00' }))

    expect(await screen.findByText('Booking 13:00–14:00 deleted.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Design review')).not.toBeInTheDocument())
    expect(store.get('t3')).toBeUndefined()
  })

  it('shows an error when deleting fails', async () => {
    server.use(
      http.delete('/api/bookings/:id', () =>
        HttpResponse.json({ code: 'BOOM', message: 'Server unavailable.' }, { status: 500 }),
      ),
    )
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Delete Design review, 13:00–14:00' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete Design review, 13:00–14:00' }))

    expect(await screen.findByText('Could not delete the booking. Server unavailable.')).toBeInTheDocument()
    expect(rowFor('Design review')).toBeInTheDocument()
  })
})

describe('server errors on save', () => {
  it('shows the message and keeps the entered values', async () => {
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json({ code: 'BOOM', message: 'Server unavailable.' }, { status: 500 }),
      ),
    )
    await renderPage()
    await fill({ start: '15:00', end: '16:00', title: 'Retro' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    expect(await within(form()).findByRole('alert')).toHaveTextContent('Server unavailable.')
    expect(startInput()).toHaveValue('15:00')
    expect(endInput()).toHaveValue('16:00')
    expect(titleInput()).toHaveValue('Retro')
    expect(screen.getByRole('button', { name: 'Create booking' })).toBeEnabled()
  })

  it('shows "Saving…" while the request is in flight', async () => {
    let release: () => void = () => {}
    server.use(
      http.post('/api/bookings', async () => {
        await new Promise<void>((resolve) => (release = resolve))
        return HttpResponse.json({ code: 'BOOM', message: 'Nope.' }, { status: 500 })
      }),
    )
    await renderPage()
    await fill({ start: '15:00', end: '16:00' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    release()
    expect(await screen.findByRole('button', { name: 'Create booking' })).toBeEnabled()
  })
})

describe('focus management', () => {
  const editButton = () => screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' })
  const deleteButton = () => screen.getByRole('button', { name: 'Delete Design review, 13:00–14:00' })

  it('returns focus to the Edit button after cancelling', async () => {
    await renderPage()
    await user.click(editButton())
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(editButton()).toHaveFocus()
  })

  it('returns focus to the Edit button after saving', async () => {
    await renderPage()
    await user.click(editButton())
    await fill({ title: 'Design review v2' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Booking 13:00–14:00 updated.')
    expect(screen.getByRole('button', { name: 'Edit Design review v2, 13:00–14:00' })).toHaveFocus()
  })

  it('focuses Keep when the delete confirmation opens, and Delete again after keeping', async () => {
    await renderPage()
    await user.click(deleteButton())
    expect(screen.getByRole('button', { name: 'Keep Design review, 13:00–14:00' })).toHaveFocus()

    await user.keyboard('{Enter}') // a repeated Enter keeps the booking
    expect(store.get('t3')).toBeDefined()
    expect(deleteButton()).toHaveFocus()
  })

  it('moves focus to the list heading after a delete', async () => {
    await renderPage()
    await user.click(deleteButton())
    await user.click(screen.getByRole('button', { name: 'Confirm delete Design review, 13:00–14:00' }))
    await screen.findByText('Booking 13:00–14:00 deleted.')
    expect(screen.getByRole('heading', { level: 2, name: 'Wednesday, 28 October 2026' })).toHaveFocus()
  })
})
