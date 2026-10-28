import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { installMockApi } from '../test/mockApi'
import { App } from './App'

describe('App', () => {
  it('renders the booking page with its own providers', async () => {
    installMockApi({ now: new Date() })
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Meeting room booking' })).toBeInTheDocument()
    expect(await screen.findByText(/no bookings yet|there were no bookings/i)).toBeInTheDocument()
  })
})
