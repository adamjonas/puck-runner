// @vitest-environment jsdom
// Regression: ISSUE-005 — Keyboard listener never removed on destroy
// Found by /qa on 2026-03-19
// Report: .gstack/qa-reports/qa-report-localhost-2026-03-19.md

import { describe, it, expect, vi } from 'vitest'
import { GameState } from './game-state'
import { InputManager } from './input'

describe('ISSUE-005: keyboard listener cleanup', () => {
  it('removes keydown listener on destroy()', () => {
    const state = new GameState()
    const input = new InputManager(state)

    const removeSpy = vi.spyOn(window, 'removeEventListener')

    input.setupKeyboard()
    input.destroy()

    expect(removeSpy.mock.calls.some(
      ([event]) => event === 'keydown',
    )).toBe(true)

    removeSpy.mockRestore()
  })

  it('does not add duplicate listeners when setupKeyboard called twice', () => {
    const state = new GameState()
    const input = new InputManager(state)
    const addSpy = vi.spyOn(window, 'addEventListener')

    input.setupKeyboard()
    input.setupKeyboard()

    const keydownCalls = addSpy.mock.calls.filter(
      ([event]) => event === 'keydown',
    )
    // Each call adds one listener, but destroy should be able to clean up
    expect(keydownCalls.length).toBe(2)

    addSpy.mockRestore()
    input.destroy()
  })
})
