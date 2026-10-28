import { describe, expect, it } from 'vitest'
import { ApiError } from '../../shared/api/http'
import { describeDeleteError, describeSaveError, isStaleDataError } from './errors'

const apiError = (status: number, code = 'X', message = 'Server says no.') => new ApiError(status, { code, message })

describe('isStaleDataError', () => {
  it.each([
    [404, true],
    [409, true],
    [422, true],
    [400, false],
    [500, false],
    [0, false],
  ])('status %i → %s', (status, expected) => {
    expect(isStaleDataError(apiError(status))).toBe(expected)
  })

  it('is false for non-API errors', () => {
    expect(isStaleDataError(new Error('boom'))).toBe(false)
  })
})

describe('describeSaveError', () => {
  it('explains a conflict and that entries are kept', () => {
    const message = describeSaveError(apiError(409, 'OVERLAP'), 'create')
    expect(message).toMatch(/someone else just booked/i)
    expect(message).toMatch(/list has been updated/i)
    expect(message).toMatch(/entries are kept/i)
  })

  it('explains a vanished booking while editing', () => {
    expect(describeSaveError(apiError(404), 'edit')).toMatch(/no longer exists/i)
  })

  it.each([
    [apiError(422, 'PAST_TIME', 'Start time has already passed.'), 'Start time has already passed.'],
    [apiError(500, 'HTTP_500', 'The server ran into a problem.'), 'The server ran into a problem.'],
    [new Error('Unexpected'), 'Unexpected'],
  ])('falls back to the error message', (error, expected) => {
    expect(describeSaveError(error, 'create')).toBe(expected)
  })
})

describe('describeDeleteError', () => {
  it('treats 404 as already deleted', () => {
    expect(describeDeleteError(apiError(404))).toMatch(/already been deleted/i)
  })

  it('prefixes other errors', () => {
    expect(describeDeleteError(apiError(500, 'X', 'Server unavailable.'))).toBe(
      'Could not delete the booking. Server unavailable.',
    )
  })
})
