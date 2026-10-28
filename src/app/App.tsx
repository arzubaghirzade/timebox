import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BookingsPage } from '../features/bookings/BookingsPage'
import { createQueryClient } from './queryClient'

export function App() {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <main className="app">
        <BookingsPage />
      </main>
    </QueryClientProvider>
  )
}
