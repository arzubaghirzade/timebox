import { useCallback, useSyncExternalStore } from 'react'

const supportsMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

/**
 * Whether a media query currently matches; updates when it changes.
 * Returns `false` where `matchMedia` is unavailable (e.g. jsdom), so the
 * simpler layout is the default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supportsMatchMedia()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )

  return useSyncExternalStore(
    subscribe,
    () => supportsMatchMedia() && window.matchMedia(query).matches,
    () => false,
  )
}
