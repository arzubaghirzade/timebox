import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MockControls } from '../../mocks/handlers'
import type { BookingStore } from '../../mocks/store'
import { installMockApi } from '../../test/mockApi'
import { renderWithProviders } from '../../test/render'
import { BookingsPage } from './BookingsPage'
import type { Booking } from './domain/types'

// Wide screens show a day timeline instead of the stacked list. jsdom has no
// matchMedia, so these tests install one; all other suites run the list layout.

const NOW = new Date(2026, 9, 28, 10, 15) // Wednesday, 28 October 2026, 10:15 local

const seed: Booking[] = [
  { id: 't1', date: '2026-10-28', start: '09:00', end: '09:30', title: 'Daily standup' },
  { id: 't2', date: '2026-10-28', start: '10:00', end: '11:00' },
  { id: 't3', date: '2026-10-28', start: '13:00', end: '14:00', title: 'Design review' },
  { id: 't4', date: '2026-10-28', start: '14:00', end: '14:30', title: 'Interview' },
]

type Listener = () => void
let isWide = true
let listeners: Listener[] = []

function installMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return isWide
      },
      media: query,
      addEventListener: (_type: string, listener: Listener) => listeners.push(listener),
      removeEventListener: (_type: string, listener: Listener) => {
        listeners = listeners.filter((l) => l !== listener)
      },
    }),
  })
}

let store: BookingStore
let controls: MockControls
let user: UserEvent

beforeEach(() => {
  isWide = true
  listeners = []
  installMatchMedia()
  ;({ store, controls } = installMockApi({ seed, now: NOW }))
  user = userEvent.setup()
})

afterEach(() => {
  // @ts-expect-error -- remove the stub so other suites see jsdom's default (no matchMedia)
  delete window.matchMedia
})

async function renderPage() {
  renderWithProviders(<BookingsPage />, { now: NOW })
  await screen.findByRole('list')
}

const block = (name: RegExp) => screen.getByRole('button', { name })
const designReview = () => block(/^Edit 13:00–14:00 Design review/)
const form = (name: 'New booking' | 'Edit booking') => screen.getByRole('form', { name })

describe('timeline layout', () => {
  it('positions each booking by its real start and duration', async () => {
    await renderPage()
    const items = within(screen.getByRole('list')).getAllByRole('listitem')
    const positions = items.map((item) => [
      item.style.getPropertyValue('--offset'),
      item.style.getPropertyValue('--duration'),
    ])
    expect(positions).toEqual([
      ['0', '30'],
      ['60', '60'],
      ['240', '60'],
      ['300', '30'],
    ])
  })

  it('draws an hour rail that is hidden from assistive technology', async () => {
    const { container } = renderWithProviders(<BookingsPage />, { now: NOW })
    await screen.findByRole('list')
    const rail = container.querySelector('.timeline__grid')
    expect(rail).toHaveAttribute('aria-hidden', 'true')
    expect(rail?.textContent).toBe('09:0010:0011:0012:0013:0014:0015:0016:0017:0018:00')
  })

  it('shows time, title and status in blocks, without inline Edit/Delete buttons', async () => {
    await renderPage()
    const list = screen.getByRole('list')
    expect(within(list).getByText('Daily standup')).toBeInTheDocument()
    expect(within(list).getByText('Finished')).toBeInTheDocument()
    expect(within(list).getByText('In progress')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
  })

  it('makes only bookings that have not started selectable', async () => {
    await renderPage()
    const blocks = within(screen.getByRole('list')).getAllByRole('button')
    expect(blocks.map((b) => b.textContent)).toEqual(['Edit 13:00–14:00 Design review', 'Edit 14:00–14:30 Interview'])
  })

  it('switches to the stacked list when the screen narrows', async () => {
    await renderPage()
    expect(screen.queryByRole('button', { name: 'Edit Design review, 13:00–14:00' })).not.toBeInTheDocument()

    isWide = false
    act(() => listeners.forEach((listener) => listener()))

    expect(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete Design review, 13:00–14:00' })).toBeInTheDocument()
  })
})

describe('selecting a booking', () => {
  it('opens it in the edit form on click and marks the block', async () => {
    await renderPage()
    await user.click(designReview())

    expect(form('Edit booking')).toBeInTheDocument()
    expect(screen.getByLabelText('Start time')).toHaveValue('13:00')
    expect(screen.getByLabelText('Start time')).toHaveFocus()
    expect(designReview()).toHaveAttribute('aria-current', 'true')
    expect(within(designReview()).getByText('Editing')).toBeInTheDocument()
  })

  it.each([
    ['Enter', '{Enter}'],
    ['Space', ' '],
  ])('can be activated with %s', async (_key, keys) => {
    await renderPage()
    designReview().focus()
    await user.keyboard(keys)
    expect(form('Edit booking')).toBeInTheDocument()
  })

  it('returns focus to the block after cancelling, every time', async () => {
    await renderPage()
    for (let i = 0; i < 2; i++) {
      await user.click(designReview())
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(designReview()).toHaveFocus()
    }
  })

  it('saves and returns focus to the updated block', async () => {
    await renderPage()
    await user.click(designReview())
    await user.clear(screen.getByLabelText('Title (optional)'))
    await user.type(screen.getByLabelText('Title (optional)'), 'Design review v2')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await screen.findByText('Booking 13:00–14:00 updated.')
    await waitFor(() => expect(block(/^Edit 13:00–14:00 Design review v2/)).toHaveFocus())
  })

  it('keeps 409 handling in edit mode', async () => {
    await renderPage()
    await user.click(designReview())
    controls.pendingConflicts = 1
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await within(form('Edit booking')).findByRole('alert')).toHaveTextContent(/someone else just booked/i)
    expect(screen.getByLabelText('Start time')).toHaveValue('13:00')
  })
})

describe('deleting from the edit form', () => {
  it('confirms, can keep, then deletes and returns to a new booking', async () => {
    await renderPage()
    await user.click(designReview())

    await user.click(screen.getByRole('button', { name: 'Delete booking' }))
    expect(screen.getByText('Delete this booking?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep booking' })).toHaveFocus()

    await user.keyboard('{Enter}') // a repeated Enter keeps the booking
    expect(store.get('t3')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Delete booking' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Delete booking' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(await screen.findByText('Booking 13:00–14:00 deleted.')).toBeInTheDocument()
    expect(store.get('t3')).toBeUndefined()
    expect(form('New booking')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Wednesday, 28 October 2026' })).toHaveFocus()
    await waitFor(() => expect(screen.queryByText('Design review')).not.toBeInTheDocument())
  })

  it('is also available in the narrow list layout', async () => {
    isWide = false
    await renderPage()
    await user.click(screen.getByRole('button', { name: 'Edit Design review, 13:00–14:00' }))
    expect(within(form('Edit booking')).getByRole('button', { name: 'Delete booking' })).toBeInTheDocument()
  })

  it('is not offered when creating', async () => {
    await renderPage()
    expect(within(form('New booking')).queryByRole('button', { name: 'Delete booking' })).not.toBeInTheDocument()
  })
})
