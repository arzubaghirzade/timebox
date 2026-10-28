import { screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { CONCURRENT_BOOKING_TITLE, type MockControls } from '../../mocks/handlers'
import type { BookingStore } from '../../mocks/store'
import { installMockApi } from '../../test/mockApi'
import { renderWithProviders } from '../../test/render'
import { BookingsPage } from './BookingsPage'
import type { Booking } from './domain/types'

// Rule 8: the server may reject a slot the UI considered free. These tests
// cover what the user sees when the list they are looking at is out of date.

const NOW = new Date(2026, 9, 28, 10, 15) // Wednesday, 28 October 2026, 10:15 local

const seed: Booking[] = [
  { id: 't2', date: '2026-10-28', start: '10:00', end: '11:00' },
  { id: 't3', date: '2026-10-28', start: '13:00', end: '14:00', title: 'Design review' },
]

let user: UserEvent

beforeEach(() => {
  user = userEvent.setup()
})

function setup({ serverNow = NOW }: { serverNow?: Date } = {}): { store: BookingStore; controls: MockControls } {
  const api = installMockApi({ seed, now: serverNow })
  renderWithProviders(<BookingsPage />, { now: NOW })
  return api
}

const form = (name: 'New booking' | 'Edit booking' = 'New booking') => screen.getByRole('form', { name })
const startInput = () => screen.getByLabelText('Start time')
const endInput = () => screen.getByLabelText('End time')
const titleInput = () => screen.getByLabelText('Title (optional)')

async function fill({ start, end, title }: { start?: string; end?: string; title?: string }) {
  for (const [input, value] of [
    [startInput, start],
    [endInput, end],
    [titleInput, title],
  ] as const) {
    if (value === undefined) continue
    await user.clear(input())
    await user.type(input(), value)
  }
  await user.tab()
}

describe('409 conflict on create', () => {
  it('shows a clear message, refreshes the list and keeps the entered values', async () => {
    const { controls } = setup()
    await screen.findByRole('list')
    controls.pendingConflicts = 1 // another user grabs the slot first

    await fill({ start: '15:00', end: '16:00', title: 'Quarterly review' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    const alert = await within(form()).findByRole('alert')
    expect(alert).toHaveTextContent(/someone else just booked an overlapping time/i)
    expect(alert).toHaveFocus()

    // Entered values survive.
    expect(startInput()).toHaveValue('15:00')
    expect(endInput()).toHaveValue('16:00')
    expect(titleInput()).toHaveValue('Quarterly review')

    // The list was refreshed and now shows the competing booking,
    // which the client-side check also picks up.
    expect(screen.getByText(CONCURRENT_BOOKING_TITLE)).toBeInTheDocument()
    expect(alert).toHaveTextContent(`Overlaps with an existing booking 15:00–16:00 (${CONCURRENT_BOOKING_TITLE}).`)
  })

  it('clears the server message once the user picks another time, and then saves', async () => {
    const { controls, store } = setup()
    await screen.findByRole('list')
    controls.pendingConflicts = 1

    await fill({ start: '15:00', end: '16:00', title: 'Quarterly review' })
    await user.click(screen.getByRole('button', { name: 'Create booking' }))
    await within(form()).findByRole('alert')

    await fill({ start: '16:00', end: '17:00' })
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create booking' }))
    expect(await screen.findByText('Booking 16:00–17:00 created.')).toBeInTheDocument()
    expect(store.all().find((b) => b.title === 'Quarterly review')).toMatchObject({ start: '16:00', end: '17:00' })
  })
})

describe('409 conflict on edit', () => {
  it('stays in edit mode with the edited values', async () => {
    const { controls } = setup()
    await user.click(await screen.findByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    controls.pendingConflicts = 1

    await fill({ start: '15:00', end: '16:30', title: 'Design review v2' })
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await within(form('Edit booking')).findByRole('alert')).toHaveTextContent(/someone else just booked/i)
    expect(startInput()).toHaveValue('15:00')
    expect(endInput()).toHaveValue('16:30')
    expect(titleInput()).toHaveValue('Design review v2')
    expect(screen.getByText(CONCURRENT_BOOKING_TITLE)).toBeInTheDocument()
  })
})

describe('404 — booking deleted elsewhere', () => {
  it('explains it on save, refreshes the list and keeps the form', async () => {
    const { store } = setup()
    await user.click(await screen.findByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    await fill({ title: 'Renamed' })

    store.remove('t3') // someone else deletes it meanwhile
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await within(form('Edit booking')).findByRole('alert')).toHaveTextContent(/no longer exists/i)
    expect(titleInput()).toHaveValue('Renamed')
    await waitFor(() => expect(screen.queryByText('Design review')).not.toBeInTheDocument())
  })

  it('treats deleting an already deleted booking as done and refreshes', async () => {
    const { store } = setup()
    await user.click(await screen.findByRole('button', { name: 'Delete Design review, 13:00–14:00' }))
    store.remove('t3')
    await user.click(screen.getByRole('button', { name: 'Confirm delete Design review, 13:00–14:00' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This booking had already been deleted.')
    await waitFor(() => expect(screen.queryByText('Design review')).not.toBeInTheDocument())
  })
})

describe('422 — server rejects what the client accepted', () => {
  it('shows the server reason and keeps the values', async () => {
    // The server clock is ahead of the client: 11:00 is already in the past there.
    setup({ serverNow: new Date(2026, 9, 28, 11, 30) })
    await screen.findByRole('list')

    await fill({ start: '11:00', end: '11:45' })
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument() // client thinks it is fine

    await user.click(screen.getByRole('button', { name: 'Create booking' }))

    expect(await within(form()).findByRole('alert')).toHaveTextContent('Start time has already passed.')
    expect(startInput()).toHaveValue('11:00')
    expect(endInput()).toHaveValue('11:45')
  })
})
