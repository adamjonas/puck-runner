import { describe, it, expect, beforeEach } from 'vitest'
import { ComboDetector, type GameEvent } from './combos'
import { GameState } from './game-state'

describe('ComboDetector', () => {
  let detector: ComboDetector
  let state: GameState

  beforeEach(() => {
    detector = new ComboDetector()
    state = new GameState()
    state.start()
    state.beginPlaying()
  })

  // ---------------------------------------------------------------------------
  // check() — no combo
  // ---------------------------------------------------------------------------

  it('returns null when no combo conditions are met', () => {
    const result = detector.check(state, {
      type: 'coin_collected',
      time: 1000,
      lane: 'center',
    })
    expect(result).toBeNull()
  })

  it('returns null for a standalone deke_success event', () => {
    const result = detector.check(state, {
      type: 'deke_success',
      time: 1000,
    })
    expect(result).toBeNull()
  })

  it('returns null for an obstacle_dodged without stickhandling', () => {
    const result = detector.check(state, {
      type: 'obstacle_dodged',
      time: 1000,
    })
    expect(result).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // THE SNIPE
  // ---------------------------------------------------------------------------

  describe('THE SNIPE', () => {
    it('triggers when deke_success + coin_collected within 1 second', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      expect(result).toBe('THE SNIPE')
    })

    it('triggers at exactly 1 second boundary', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 6000,
        lane: 'center',
      })
      expect(result).toBe('THE SNIPE')
    })

    it('does NOT trigger if events are more than 1 second apart', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 6001,
        lane: 'center',
      })
      expect(result).toBeNull()
    })

    it('adds 50 bonus points to state score', () => {
      const scoreBefore = state.score
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      // 50 points for THE SNIPE (applied via addScore which uses multiplier)
      expect(state.score).toBe(scoreBefore + 50)
    })

    it('consumes the deke so it cannot double-trigger', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5300,
        lane: 'center',
      })

      // Second coin should NOT trigger another SNIPE
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 5600,
        lane: 'left',
      })
      expect(result).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // THE GRETZKY
  // ---------------------------------------------------------------------------

  describe('THE GRETZKY', () => {
    it('triggers when deke + stickhandling + coin within 1.5 seconds', () => {
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })

      const result = detector.check(state, {
        type: 'coin_collected',
        time: 6000,
        lane: 'center',
      })
      expect(result).toBe('THE GRETZKY')
    })

    it('triggers at exactly 1.5 second boundary', () => {
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })

      const result = detector.check(state, {
        type: 'coin_collected',
        time: 6500,
        lane: 'center',
      })
      expect(result).toBe('THE GRETZKY')
    })

    it('does NOT trigger beyond 1.5 seconds', () => {
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })

      const result = detector.check(state, {
        type: 'coin_collected',
        time: 6501,
        lane: 'center',
      })
      // Falls through to THE SNIPE check, but 1501ms > 1000ms so also null
      expect(result).toBeNull()
    })

    it('takes priority over THE SNIPE (checked first)', () => {
      // Both GRETZKY and SNIPE conditions are met (within 1s, stickhandling on)
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })

      const result = detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      // Should be GRETZKY, not SNIPE
      expect(result).toBe('THE GRETZKY')
    })

    it('awards 100 bonus points', () => {
      const scoreBefore = state.score
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      expect(state.score).toBe(scoreBefore + 100)
    })

    it('does NOT trigger if stickhandling was inactive at deke time', () => {
      // Stickhandling is off during deke
      state.stickhandlingActive = false
      detector.check(state, { type: 'deke_success', time: 5000 })

      // Even if stickhandling turns on before the coin
      state.stickhandlingActive = true
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      // Should fall through to THE SNIPE, not GRETZKY
      expect(result).toBe('THE SNIPE')
    })
  })

  // ---------------------------------------------------------------------------
  // COAST TO COAST
  // ---------------------------------------------------------------------------

  describe('COAST TO COAST', () => {
    it('triggers when coins collected in all 3 lanes within 3 seconds', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'center',
      })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 12_000,
        lane: 'right',
      })
      expect(result).toBe('COAST TO COAST')
    })

    it('triggers at exactly 3 second boundary', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 11_500,
        lane: 'center',
      })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 13_000,
        lane: 'right',
      })
      expect(result).toBe('COAST TO COAST')
    })

    it('does NOT trigger if earliest coin is older than 3 seconds', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'center',
      })
      // 3001ms after the first coin
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 13_001,
        lane: 'right',
      })
      expect(result).toBeNull()
    })

    it('does NOT trigger with only 2 distinct lanes', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 10_500,
        lane: 'left',
      })
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'center',
      })
      expect(result).toBeNull()
    })

    it('awards 75 bonus points', () => {
      const scoreBefore = state.score
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'center',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 12_000,
        lane: 'right',
      })
      expect(state.score).toBe(scoreBefore + 75)
    })
  })

  // ---------------------------------------------------------------------------
  // Combo state effects
  // ---------------------------------------------------------------------------

  describe('combo state effects', () => {
    it('sets state.comboText with combo name and points', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      expect(state.comboText).toBe('THE SNIPE +50')
    })

    it('sets state.comboTextUntil to event time + 2000ms', () => {
      const eventTime = 5500
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: eventTime,
        lane: 'center',
      })
      expect(state.comboTextUntil).toBe(eventTime + 2000)
    })

    it('THE GRETZKY sets correct combo text', () => {
      state.stickhandlingActive = true
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      expect(state.comboText).toBe('THE GRETZKY +100')
    })

    it('COAST TO COAST sets correct combo text', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'center',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 12_000,
        lane: 'right',
      })
      expect(state.comboText).toBe('COAST TO COAST +75')
    })

    it('combo points respect the state multiplier', () => {
      state.multiplier = 3
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      // 50 * 3 = 150
      expect(state.score).toBe(150)
    })
  })

  // ---------------------------------------------------------------------------
  // reset()
  // ---------------------------------------------------------------------------

  describe('reset()', () => {
    it('clears internal state so old dekes do not carry over', () => {
      detector.check(state, { type: 'deke_success', time: 5000 })
      detector.reset()

      const result = detector.check(state, {
        type: 'coin_collected',
        time: 5500,
        lane: 'center',
      })
      expect(result).toBeNull()
    })

    it('clears lane coin history', () => {
      detector.check(state, {
        type: 'coin_collected',
        time: 10_000,
        lane: 'left',
      })
      detector.check(state, {
        type: 'coin_collected',
        time: 10_500,
        lane: 'center',
      })
      detector.reset()

      // Even though we add a third lane, the old history was cleared
      const result = detector.check(state, {
        type: 'coin_collected',
        time: 11_000,
        lane: 'right',
      })
      expect(result).toBeNull()
    })
  })
})
