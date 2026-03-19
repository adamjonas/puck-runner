import { describe, it, expect, beforeEach } from 'vitest'
import { TutorialManager, TutorialStep } from './tutorial'
import { GameState } from './game-state'

describe('TutorialManager', () => {
  let tutorial: TutorialManager
  let state: GameState

  beforeEach(() => {
    state = new GameState()
    tutorial = new TutorialManager()
    tutorial.start(state)
  })

  // --- Lifecycle ---

  it('starts at LANES step', () => {
    expect(tutorial.getStep()).toBe(TutorialStep.LANES)
  })

  it('isActive() returns true during tutorial', () => {
    expect(tutorial.isActive()).toBe(true)
  })

  it('isComplete() returns false during tutorial', () => {
    expect(tutorial.isComplete()).toBe(false)
  })

  it('getStepName() returns human-readable step name', () => {
    expect(tutorial.getStepName()).toBe('LANES')
  })

  it('getOverlayText() returns instruction text for current step', () => {
    expect(tutorial.getOverlayText()).toContain('lane')
  })

  it('getStepIndex() returns 0-based index', () => {
    expect(tutorial.getStepIndex()).toBe(0)
  })

  it('getTotalSteps() returns 4 (LANES, OBSTACLES, COINS, STICKHANDLING)', () => {
    expect(tutorial.getTotalSteps(false)).toBe(4)
    expect(tutorial.getTotalSteps(true)).toBe(4)
  })

  // --- Step 1: LANES ---

  it('does not advance from LANES until all 3 lanes visited', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    expect(tutorial.getStep()).toBe(TutorialStep.LANES)
  })

  it('advances to OBSTACLES after all 3 lanes visited', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    expect(tutorial.getStep()).toBe(TutorialStep.OBSTACLES)
  })

  it('deduplicates lane visits', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('left')
    expect(tutorial.getStep()).toBe(TutorialStep.LANES)
  })

  // --- Step 2: OBSTACLES ---

  it('does not advance from OBSTACLES until 2 obstacles dodged', () => {
    // Advance to OBSTACLES
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    expect(tutorial.getStep()).toBe(TutorialStep.OBSTACLES)

    tutorial.onObstacleDodged()
    expect(tutorial.getStep()).toBe(TutorialStep.OBSTACLES)
  })

  it('advances to COINS after 2 obstacles dodged', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')

    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    expect(tutorial.getStep()).toBe(TutorialStep.COINS)
  })

  // --- Step 3: COINS ---

  it('does not advance from COINS until 3 coins collected', () => {
    // Advance to COINS
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    expect(tutorial.getStep()).toBe(TutorialStep.COINS)

    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    expect(tutorial.getStep()).toBe(TutorialStep.COINS)
  })

  it('advances to STICKHANDLING after 3 coins when tracker connected', () => {
    state.trackerConnected = true

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()

    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    expect(tutorial.getStep()).toBe(TutorialStep.STICKHANDLING)
  })

  it('shows STICKHANDLING even without tracker (use S key)', () => {
    state.trackerConnected = false

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()

    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    expect(tutorial.getStep()).toBe(TutorialStep.STICKHANDLING)
  })

  it('shows keyboard hint for stickhandling when no tracker', () => {
    state.trackerConnected = false

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    expect(tutorial.getOverlayText()).toContain('Press S')
  })

  // --- Step 4: STICKHANDLING ---

  it('tracks stickhandle count', () => {
    state.trackerConnected = true

    // Advance to STICKHANDLING
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    expect(tutorial.getStickhandleCount()).toBe(0)
    tutorial.onStickhandle()
    tutorial.onStickhandle()
    tutorial.onStickhandle()
    expect(tutorial.getStickhandleCount()).toBe(3)
  })

  it('tracks accumulated stickhandling points', () => {
    state.trackerConnected = true

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    expect(tutorial.getStickhandlePoints()).toBe(0)
    tutorial.onStickhandle()
    expect(tutorial.getStickhandlePoints()).toBe(5) // 5 points per stickhandle
  })

  it('advances to READY after 3 seconds of stickhandling', () => {
    state.trackerConnected = true

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    expect(tutorial.getStep()).toBe(TutorialStep.STICKHANDLING)
    tutorial.onStickhandlingDuration(3000)
    expect(tutorial.getStep()).toBe(TutorialStep.READY)
  })

  it('does not advance STICKHANDLING before 3 seconds', () => {
    state.trackerConnected = true

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    tutorial.onStickhandlingDuration(2000)
    expect(tutorial.getStep()).toBe(TutorialStep.STICKHANDLING)
  })

  it('auto-advances STICKHANDLING after timeout (10 seconds)', () => {
    state.trackerConnected = true

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()

    tutorial.onStepTimeout()
    expect(tutorial.getStep()).toBe(TutorialStep.READY)
  })

  // --- Step 5: READY ---

  it('isComplete() returns true at READY step', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onStickhandlingDuration(3000)

    expect(tutorial.getStep()).toBe(TutorialStep.READY)
    expect(tutorial.isComplete()).toBe(true)
    expect(tutorial.isActive()).toBe(false)
  })

  // --- Skip ---

  it('skip() immediately completes the tutorial', () => {
    expect(tutorial.isActive()).toBe(true)
    tutorial.skip()
    expect(tutorial.isComplete()).toBe(true)
    expect(tutorial.isActive()).toBe(false)
    expect(tutorial.getStep()).toBe(TutorialStep.READY)
  })

  // --- Overlay text varies per step ---

  it('overlay text changes with each step', () => {
    const lanesText = tutorial.getOverlayText()

    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')
    const obstaclesText = tutorial.getOverlayText()

    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    const coinsText = tutorial.getOverlayText()

    expect(lanesText).not.toBe(obstaclesText)
    expect(obstaclesText).not.toBe(coinsText)
  })

  // --- Events ignored when not on the relevant step ---

  it('ignores obstacle dodges during LANES step', () => {
    tutorial.onObstacleDodged()
    tutorial.onObstacleDodged()
    expect(tutorial.getStep()).toBe(TutorialStep.LANES)
  })

  it('ignores coin collections during OBSTACLES step', () => {
    tutorial.onLaneVisited('left')
    tutorial.onLaneVisited('center')
    tutorial.onLaneVisited('right')

    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    tutorial.onCoinCollected()
    // Should still be on OBSTACLES, not COINS
    expect(tutorial.getStep()).toBe(TutorialStep.OBSTACLES)
  })
})
