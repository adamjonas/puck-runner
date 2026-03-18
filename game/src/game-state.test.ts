import { describe, it, expect } from 'vitest'
import { GameState } from './game-state'

describe('GameState', () => {
  it('starts in title screen', () => {
    const state = new GameState()
    expect(state.screen).toBe('title')
    expect(state.lane).toBe('center')
    expect(state.avatarX).toBe(0.5)
  })

  it('transitions to playing on start()', () => {
    const state = new GameState()
    state.start()
    expect(state.screen).toBe('playing')
    expect(state.startTime).toBeGreaterThan(0)
  })

  it('sets lane and target position', () => {
    const state = new GameState()
    state.setLane('left')
    expect(state.lane).toBe('left')
    expect(state.targetAvatarX).toBe(GameState.LANE_X.left)

    state.setLane('right')
    expect(state.lane).toBe('right')
    expect(state.targetAvatarX).toBe(GameState.LANE_X.right)
  })

  it('does not update target if lane unchanged', () => {
    const state = new GameState()
    state.setLane('center')
    const before = state.targetAvatarX
    state.setLane('center')
    expect(state.targetAvatarX).toBe(before)
  })

  it('smoothly transitions avatar position toward target', () => {
    const state = new GameState()
    state.setLane('left')
    // Avatar starts at 0.5, target is 0.2
    expect(state.avatarX).toBe(0.5)

    // After one update step, should move toward target
    state.updatePosition(16) // ~1 frame at 60fps
    expect(state.avatarX).toBeLessThan(0.5)
    expect(state.avatarX).toBeGreaterThan(0.2)
  })

  it('snaps to target when very close', () => {
    const state = new GameState()
    state.avatarX = 0.2005
    state.targetAvatarX = 0.2
    state.updatePosition(16)
    expect(state.avatarX).toBe(0.2)
  })

  it('resets all state', () => {
    const state = new GameState()
    state.start()
    state.setLane('right')
    state.confidence = 0.9
    state.reset()

    expect(state.screen).toBe('title')
    expect(state.lane).toBe('center')
    expect(state.avatarX).toBe(0.5)
    expect(state.confidence).toBe(0)
    expect(state.elapsed).toBe(0)
  })
})
