import { describe, expect, it } from 'vitest'
import { timelineHours, timelinePosition, WORKING_DAY_MINUTES } from './timeline'

describe('timelinePosition', () => {
  it.each([
    ['09:00', '09:30', 0, 30],
    ['09:00', '18:00', 0, 540],
    ['13:00', '14:00', 240, 60],
    ['10:15', '11:45', 75, 90],
    ['17:30', '18:00', 510, 30],
  ])('%s–%s → offset %i, duration %i', (start, end, offset, duration) => {
    expect(timelinePosition({ start, end })).toEqual({ offset, duration })
  })

  it.each([
    ['08:00', '10:00', 0, 60],
    ['17:00', '19:00', 480, 60],
    ['12:00', '11:00', 180, 0],
  ])('clamps %s–%s to the working day', (start, end, offset, duration) => {
    expect(timelinePosition({ start, end })).toEqual({ offset, duration })
  })
})

describe('timelineHours', () => {
  it('marks every hour from opening to closing', () => {
    expect(timelineHours()).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
      '18:00',
    ])
    expect(WORKING_DAY_MINUTES).toBe(540)
  })
})
