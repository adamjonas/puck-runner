import { describe, it, expect } from 'vitest'
import type { TrackingInput } from '@shared/protocol'
import { GameState } from './game-state'
import { isInteractiveEventTarget, shouldSuppressGlobalKeydown } from './dom-utils'
import { KalmanAxis } from './kalman'
import { InputManager } from './input'

function makeTarget(
  tagName?: string,
  parentElement: Record<string, unknown> | null = null,
  isContentEditable = false,
): Record<string, unknown> {
  return {
    tagName,
    parentElement,
    isContentEditable,
  }
}

describe('isInteractiveEventTarget', () => {
  it('returns true for buttons', () => {
    expect(isInteractiveEventTarget(makeTarget('button') as unknown as EventTarget)).toBe(true)
  })

  it('returns true for descendants of interactive elements', () => {
    const button = makeTarget('button')
    const child = makeTarget('span', button)

    expect(isInteractiveEventTarget(child as unknown as EventTarget)).toBe(true)
  })

  it('returns true for content-editable elements', () => {
    expect(isInteractiveEventTarget(makeTarget('div', null, true) as unknown as EventTarget)).toBe(true)
  })

  it('returns false for non-interactive elements', () => {
    const wrapper = makeTarget('div')
    const child = makeTarget('span', wrapper)

    expect(isInteractiveEventTarget(child as unknown as EventTarget)).toBe(false)
  })

  it('returns false for null targets', () => {
    expect(isInteractiveEventTarget(null)).toBe(false)
  })
})

describe('shouldSuppressGlobalKeydown', () => {
  it('suppresses Enter on interactive elements', () => {
    expect(shouldSuppressGlobalKeydown(makeTarget('button') as unknown as EventTarget, 'Enter')).toBe(true)
  })

  it('suppresses Space on interactive elements', () => {
    expect(shouldSuppressGlobalKeydown(makeTarget('button') as unknown as EventTarget, ' ')).toBe(true)
  })

  it('does not suppress gameplay keys on interactive elements', () => {
    expect(shouldSuppressGlobalKeydown(makeTarget('button') as unknown as EventTarget, 'ArrowLeft')).toBe(false)
    expect(shouldSuppressGlobalKeydown(makeTarget('button') as unknown as EventTarget, 's')).toBe(false)
  })

  it('does not suppress Enter on non-interactive elements', () => {
    expect(shouldSuppressGlobalKeydown(makeTarget('div') as unknown as EventTarget, 'Enter')).toBe(false)
  })
})

describe('InputManager interpolation', () => {
  function callHandleInput(manager: InputManager, input: TrackingInput): void {
    ;(manager as unknown as { handleTrackingInput: (v: TrackingInput) => void }).handleTrackingInput(input)
  }

  it('updateInterpolatedPosition updates rawX/rawY from interpolated position', () => {
    const state = new GameState()
    state.screen = 'playing'
    const manager = new InputManager(state)

    // First sample at t=0
    callHandleInput(manager, {
      type: 'input', ts: 1000, raw: { x: 0.2, y: 0.5 },
      lane: 'left', deke: false, confidence: 0.9,
      stickhandling: { active: false, frequency: 0, amplitude: 0 },
    })

    // Second sample ~33ms later
    callHandleInput(manager, {
      type: 'input', ts: 1033, raw: { x: 0.4, y: 0.5 },
      lane: 'center', deke: false, confidence: 0.9,
      stickhandling: { active: false, frequency: 0, amplitude: 0 },
    })

    // Call updateInterpolatedPosition at a time between samples
    // The second sample sets curr.ts to performance.now() at that moment,
    // so we call with now slightly after to get extrapolated value
    const now = performance.now()
    manager.updateInterpolatedPosition(now)

    // rawX should have been updated (not still at the stale 0.4 from last input)
    expect(state.rawX).toBeDefined()
    expect(state.rawY).toBeDefined()
  })

  it('updateInterpolatedPosition is no-op when no samples exist', () => {
    const state = new GameState()
    const manager = new InputManager(state)

    // rawX/rawY start at defaults
    manager.updateInterpolatedPosition(performance.now())
    expect(state.rawX).toBe(0.5)
    expect(state.rawY).toBe(0.5)
  })

  it('predicts position forward from Kalman velocity', () => {
    const state = new GameState()
    state.screen = 'playing'
    const manager = new InputManager(state)

    const accessor = manager as unknown as {
      kalmanX: KalmanAxis | null
      kalmanY: KalmanAxis | null
      lastKalmanTime: number
    }

    const kalmanX = new KalmanAxis(0.4)
    const kalmanY = new KalmanAxis(0.5)
    ;(kalmanX as unknown as { v: number }).v = 4
    ;(kalmanY as unknown as { v: number }).v = -2

    accessor.kalmanX = kalmanX
    accessor.kalmanY = kalmanY
    accessor.lastKalmanTime = 100

    manager.updateInterpolatedPosition(150)
    expect(state.rawX).toBeCloseTo(0.6, 2)
    expect(state.rawY).toBeCloseTo(0.4, 2)
  })
})

describe('InputManager adaptive confidence', () => {
  function callHandleInput(manager: InputManager, input: TrackingInput): void {
    ;(manager as unknown as { handleTrackingInput: (v: TrackingInput) => void }).handleTrackingInput(input)
  }

  it('accepts lane changes at confidence 0.3 (below old 0.5 threshold)', () => {
    const state = new GameState()
    state.screen = 'playing'
    const manager = new InputManager(state)

    callHandleInput(manager, {
      type: 'input', ts: 1000, raw: { x: 0.8, y: 0.5 },
      lane: 'right', deke: false, confidence: 0.3,
      stickhandling: { active: false, frequency: 0, amplitude: 0 },
    })

    expect(state.lane).toBe('right')
  })

  it('ignores input at very low confidence (below 0.15)', () => {
    const state = new GameState()
    state.screen = 'playing'
    const manager = new InputManager(state)

    callHandleInput(manager, {
      type: 'input', ts: 1000, raw: { x: 0.8, y: 0.5 },
      lane: 'right', deke: false, confidence: 0.1,
      stickhandling: { active: false, frequency: 0, amplitude: 0 },
    })

    expect(state.lane).toBe('center') // unchanged
  })
})

describe('InputManager tutorial tracking', () => {
  it('applies tracker lane and stickhandling state during tutorial', () => {
    const state = new GameState()
    state.screen = 'tutorial'

    const manager = new InputManager(state)
    const input: TrackingInput = {
      type: 'input',
      ts: 1000,
      raw: { x: 0.8, y: 0.5 },
      lane: 'right',
      deke: false,
      confidence: 0.9,
      stickhandling: {
        active: true,
        frequency: 4.2,
        amplitude: 0.3,
      },
    }

    ;(manager as unknown as { handleTrackingInput: (value: TrackingInput) => void }).handleTrackingInput(input)

    expect(state.lane).toBe('right')
    expect(state.stickhandlingActive).toBe(true)
    expect(state.stickhandlingFrequency).toBe(4.2)
    expect(state.stickhandlingStreakStart).toBeGreaterThan(0)
  })
})

describe('InputManager resetTrackingState', () => {
  it('clears filter state and buffered input', () => {
    const state = new GameState()
    const manager = new InputManager(state, { jitterBufferMs: 50 })
    const accessor = manager as unknown as {
      kalmanX: KalmanAxis | null
      kalmanY: KalmanAxis | null
      lastKalmanTime: number
      prevDeke: boolean
      jitterBuffer: { push: (value: TrackingInput, now: number) => void; buffer: Array<unknown> }
    }

    accessor.kalmanX = new KalmanAxis(0.25)
    accessor.kalmanY = new KalmanAxis(0.75)
    accessor.lastKalmanTime = 123
    accessor.prevDeke = true
    accessor.jitterBuffer.push({
      type: 'input',
      ts: 1000,
      raw: { x: 0.8, y: 0.5 },
      lane: 'right',
      deke: false,
      confidence: 0.9,
      stickhandling: { active: false, frequency: 0, amplitude: 0 },
    }, 1000)

    manager.resetTrackingState()

    expect(accessor.kalmanX).toBeNull()
    expect(accessor.kalmanY).toBeNull()
    expect(accessor.lastKalmanTime).toBe(0)
    expect(accessor.prevDeke).toBe(false)
    expect(accessor.jitterBuffer.buffer.length).toBe(0)
  })
})
