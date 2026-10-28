import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './index.css'

function render(container: HTMLElement) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

// There is no real backend: the mock API must be running before the first request.
// If it fails to start, the app still renders and shows its normal load-error state.
// Loaded lazily so MSW stays out of the main bundle.
import('./mocks/browser')
  .then(({ startMockApi }) => startMockApi())
  .catch((error: unknown) => console.error('Failed to start the mock API', error))
  .finally(() => render(rootElement))
