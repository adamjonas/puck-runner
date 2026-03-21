import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameRuntime } from './game-runtime'
import { GameState } from './game-state'

vi.mock('./audio', () => ({
  playSound: vi.fn(),
  unmuteAudio: vi.fn(),
}))

vi.mock('./announcer', async () => {
  const actual = await vi.importActual<typeof import('./announcer')>('./announcer')
  return {
    ...actual,
    announceGameStart: vi.fn(),
  }
})

interface StubInput {
  inputRate: number
  processBufferedInput: ReturnType<typeof vi.fn>
  updateInterpolatedPosition: ReturnType<typeof vi.fn>
  updateInputRate: ReturnType<typeof vi.fn>
}

describe('GameRuntime', () => {
  let state: GameState
  let input: StubInput
  let announcer: { announce: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  let scoring: { update: ReturnType<typeof vi.fn> }
  let tutorial: { update: ReturnType<typeof vi.fn> }
  let runtime: GameRuntime

  beforeEach(() => {
    state = new GameState()
    input = {
      inputRate: 24,
      processBufferedInput: vi.fn(),
      updateInterpolatedPosition: vi.fn(),
      updateInputRate: vi.fn(),
    }
    announcer = { announce: vi.fn(), update: vi.fn() }
    scoring = { update: vi.fn() }
    tutorial = { update: vi.fn() }
    runtime = new GameRuntime(
      state,
      { clientHeight: 720 } as Pick<HTMLCanvasElement, 'clientHeight'>,
      { announcer, input, scoring, tutorial },
    )
  })

  it('delegates tutorial frames to TutorialSession only', () => {
    state.screen = 'tutorial'
    state.startTime = 1000

    runtime.update(1500, 16)

    expect(tutorial.update).toHaveBeenCalledWith(1500, 16, 720)
    expect(scoring.update).not.toHaveBeenCalled()
    expect(announcer.update).toHaveBeenCalledWith(1500)
  })

  it('transitions from countdown to playing and runs playing systems in the same frame', () => {
    state.startCountdown(1000)

    runtime.update(4000, 16)

    expect(state.screen).toBe('playing')
    expect(scoring.update).toHaveBeenCalledOnce()
    expect(scoring.update).toHaveBeenCalledWith(4000, null)
  })

  it('pauses when tracker confidence stays below the shared minimum after the grace window', () => {
    state.screen = 'playing'
    state.startTime = 1000
    state.trackerConnected = true
    state.lastInputTime = 1000
    state.confidence = 0.1

    runtime.update(2101, 16)

    expect(state.screen).toBe('paused')
  })

  it('resumes from pause when fresh confident input arrives', () => {
    state.screen = 'paused'
    state.lastInputTime = 5000
    state.confidence = 0.9

    runtime.update(5199, 16)

    expect(state.screen).toBe('playing')
  })

  it('tracks fps and mirrors input rate into GameState', () => {
    runtime.update(1000, 16)

    expect(input.updateInputRate).toHaveBeenCalledWith(1000)
    expect(state.fps).toBe(1)
    expect(state.inputRate).toBe(24)
  })
})
