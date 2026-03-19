import { describe, it, expect } from 'vitest'
import type { TrackingInput } from '@shared/protocol'
import { GameState } from './game-state'
import { InputManager, isInteractiveEventTarget, shouldSuppressGlobalKeydown } from './input'

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
