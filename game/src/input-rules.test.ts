import { describe, expect, it } from 'vitest'
import {
  isControllableTrackingScreen,
  resolveControllableTracking,
  resolveGameOverActionLane,
} from './input-rules'

describe('input-rules', () => {
  it('identifies playing and tutorial as controllable tracking screens', () => {
    expect(isControllableTrackingScreen('playing')).toBe(true)
    expect(isControllableTrackingScreen('tutorial')).toBe(true)
    expect(isControllableTrackingScreen('title')).toBe(false)
  })

  it('suppresses control application below the tracking confidence minimum', () => {
    expect(resolveControllableTracking({
      screen: 'playing',
      confidence: 0.1,
      inputDeke: true,
      prevDeke: false,
      stickhandlingActive: true,
      stickhandlingFrequency: 4,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: true,
      now: 1000,
    }).shouldApplyControls).toBe(false)
  })

  it('triggers deke only on a playing-screen rising edge', () => {
    expect(resolveControllableTracking({
      screen: 'playing',
      confidence: 0.9,
      inputDeke: true,
      prevDeke: false,
      stickhandlingActive: false,
      stickhandlingFrequency: 0,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: false,
      now: 1000,
    }).shouldTriggerDeke).toBe(true)

    expect(resolveControllableTracking({
      screen: 'tutorial',
      confidence: 0.9,
      inputDeke: true,
      prevDeke: false,
      stickhandlingActive: false,
      stickhandlingFrequency: 0,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: false,
      now: 1000,
    }).shouldTriggerDeke).toBe(false)
  })

  it('updates stickhandling streak state from tracker activity', () => {
    expect(resolveControllableTracking({
      screen: 'playing',
      confidence: 0.9,
      inputDeke: false,
      prevDeke: false,
      stickhandlingActive: true,
      stickhandlingFrequency: 4.2,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: false,
      now: 1000,
    })).toMatchObject({
      shouldApplyControls: true,
      stickhandlingStreakStart: 1000,
      silkyMittsAwarded: false,
    })

    expect(resolveControllableTracking({
      screen: 'playing',
      confidence: 0.9,
      inputDeke: false,
      prevDeke: false,
      stickhandlingActive: false,
      stickhandlingFrequency: 0,
      stickhandlingStreakStart: 1000,
      silkyMittsAwarded: true,
      now: 1500,
    })).toMatchObject({
      shouldApplyControls: true,
      stickhandlingStreakStart: 0,
      silkyMittsAwarded: false,
    })
  })

  it('drops game over gesture lanes below confidence minimum', () => {
    expect(resolveGameOverActionLane('left', 0.9)).toBe('left')
    expect(resolveGameOverActionLane('left', 0.1)).toBeNull()
  })
})
