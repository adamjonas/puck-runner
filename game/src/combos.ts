/**
 * Trick-shot combo detection system.
 *
 * Monitors game events each frame and awards bonus points
 * when specific combo conditions are met.
 */

import type { Lane } from '@shared/protocol'
import { GameState } from './game-state'

// ---------------------------------------------------------------------------
// Event types emitted by game logic
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'deke_success'; time: number }
  | { type: 'coin_collected'; time: number; lane: Lane }
  | { type: 'obstacle_dodged'; time: number }

// ---------------------------------------------------------------------------
// Combo definitions
// ---------------------------------------------------------------------------

interface ComboReward {
  name: string
  points: number
}

const COMBOS = {
  THE_SNIPE: { name: 'THE SNIPE', points: 50 } as ComboReward,
  THE_GRETZKY: { name: 'THE GRETZKY', points: 100 } as ComboReward,
  SILKY_MITTS: { name: 'SILKY MITTS', points: 50 } as ComboReward,
  COAST_TO_COAST: { name: 'COAST TO COAST', points: 75 } as ComboReward,
} as const

/** Duration (ms) to display combo text on screen. */
const COMBO_DISPLAY_MS = 2000

// ---------------------------------------------------------------------------
// ComboDetector
// ---------------------------------------------------------------------------

/**
 * Stateful combo detector. Create one instance and call `check()` every frame
 * with the current game state and any events that occurred this frame.
 *
 * Returns the combo name string when a combo triggers, or `null` otherwise.
 */
export class ComboDetector {
  /** Timestamp of the most recent successful deke. */
  private lastDekeTime = 0

  /** Whether stickhandling was active at the time of the last deke. */
  private stickhandlingAtDeke = false

  /**
   * Ring buffer tracking the last coin-collection events for
   * COAST TO COAST detection: stores { lane, time } tuples.
   */
  private laneCoinHistory: Array<{ lane: Lane; time: number }> = []

  /** Maximum entries kept in the lane ring buffer. */
  private static readonly LANE_BUFFER_SIZE = 12

  /** Whether SILKY MITTS has already been awarded this run. */
  private silkyMittsAwarded = false

  /** Reset detector state (call when a new game starts). */
  reset(): void {
    this.lastDekeTime = 0
    this.stickhandlingAtDeke = false
    this.laneCoinHistory = []
    this.silkyMittsAwarded = false
  }

  /**
   * Process a single game event against the current state.
   * May mutate `state.comboText`, `state.comboTextUntil`, and `state.score`.
   *
   * @returns The combo name if one triggered, otherwise `null`.
   */
  check(state: GameState, event: GameEvent): string | null {
    const now = event.time

    switch (event.type) {
      case 'deke_success': {
        this.lastDekeTime = now
        this.stickhandlingAtDeke = state.stickhandlingActive
        return null
      }

      case 'coin_collected': {
        // Record for COAST TO COAST
        this.pushLaneCoin(event.lane, now)

        // --- THE GRETZKY: deke + stickhandling + coin within 1.5 s ---
        if (
          this.lastDekeTime > 0 &&
          now - this.lastDekeTime <= 1500 &&
          this.stickhandlingAtDeke
        ) {
          // Consume the deke so it can't double-trigger
          this.lastDekeTime = 0
          return this.award(state, COMBOS.THE_GRETZKY, now)
        }

        // --- THE SNIPE: deke + coin within 1 s (no stickhandling required) ---
        if (this.lastDekeTime > 0 && now - this.lastDekeTime <= 1000) {
          this.lastDekeTime = 0
          return this.award(state, COMBOS.THE_SNIPE, now)
        }

        // --- COAST TO COAST: coins in all 3 lanes within 3 s ---
        if (this.checkCoastToCoast(now)) {
          return this.award(state, COMBOS.COAST_TO_COAST, now)
        }

        return null
      }

      case 'obstacle_dodged': {
        // --- SILKY MITTS: 5+ s continuous stickhandling ---
        if (
          !this.silkyMittsAwarded &&
          !state.silkyMittsAwarded &&
          state.stickhandlingActive &&
          state.stickhandlingStreakStart > 0 &&
          now - state.stickhandlingStreakStart >=
            GameState.SILKY_MITTS_THRESHOLD_MS
        ) {
          this.silkyMittsAwarded = true
          state.silkyMittsAwarded = true
          return this.award(state, COMBOS.SILKY_MITTS, now)
        }
        return null
      }

      default:
        return null
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Award a combo: add points, set display text, return name. */
  private award(
    state: GameState,
    combo: ComboReward,
    now: number,
  ): string {
    state.addScore(combo.points)
    state.comboText = `${combo.name} +${combo.points}`
    state.comboTextUntil = now + COMBO_DISPLAY_MS
    return combo.name
  }

  /** Push a lane/time entry into the ring buffer. */
  private pushLaneCoin(lane: Lane, time: number): void {
    this.laneCoinHistory.push({ lane, time })
    if (this.laneCoinHistory.length > ComboDetector.LANE_BUFFER_SIZE) {
      this.laneCoinHistory.shift()
    }
  }

  /**
   * Check whether coins have been collected in all three lanes
   * within the last 3 seconds.
   */
  private checkCoastToCoast(now: number): boolean {
    const window = 3000
    const cutoff = now - window

    const recent = this.laneCoinHistory.filter((e) => e.time >= cutoff)

    const lanes = new Set<Lane>()
    for (const entry of recent) {
      lanes.add(entry.lane)
      if (lanes.size === 3) return true
    }
    return false
  }
}
