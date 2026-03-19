/**
 * Hockey play-by-play announcer system.
 *
 * Triggers voice-like sound effects via the existing `playSound()` and manages
 * on-screen text callouts with a priority queue so announcements don't overlap.
 */

import { playSound, type SoundName } from './audio'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedAnnouncement {
  text: string
  sound: SoundName
  priority: number // 1 (lowest) – 5 (highest)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum gap between announcements in milliseconds. */
const MIN_GAP_MS = 2000

/** How long the text stays on screen (ms). */
const DISPLAY_DURATION_MS = 2000

// ---------------------------------------------------------------------------
// Announcer
// ---------------------------------------------------------------------------

export class Announcer {
  /** Pending announcements sorted by priority (highest first). */
  private queue: QueuedAnnouncement[] = []

  /** The announcement currently being displayed. */
  private current: QueuedAnnouncement | null = null

  /** Timestamp when the current announcement was shown. */
  private currentStartTime = 0

  /** Earliest time the next announcement is allowed to appear. */
  private nextAllowedTime = 0

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Enqueue an announcement.
   *
   * @param text    Text to display on screen.
   * @param sound   Sound effect to play (from audio.ts).
   * @param priority 1–5 (5 = highest). Defaults to 2.
   */
  announce(text: string, sound: SoundName, priority = 2): void {
    const entry: QueuedAnnouncement = { text, sound, priority }

    // If a higher-priority announcement arrives while a lower-priority one
    // is currently showing, interrupt it immediately.
    if (
      this.current &&
      priority > this.current.priority
    ) {
      this.showAnnouncement(entry, performance.now())
      return
    }

    // Insert into the queue maintaining descending priority order.
    let inserted = false
    for (let i = 0; i < this.queue.length; i++) {
      if (priority > this.queue[i].priority) {
        this.queue.splice(i, 0, entry)
        inserted = true
        break
      }
    }
    if (!inserted) {
      this.queue.push(entry)
    }
  }

  /**
   * Call once per frame. Manages display timing and drains the queue.
   */
  update(now: number): void {
    // If the current announcement has expired, clear it.
    if (this.current && now >= this.currentStartTime + DISPLAY_DURATION_MS) {
      this.current = null
    }

    // If nothing is showing and the cooldown has elapsed, pop next from queue.
    if (!this.current && this.queue.length > 0 && now >= this.nextAllowedTime) {
      const next = this.queue.shift()!
      this.showAnnouncement(next, now)
    }
  }

  /**
   * Returns the text of the current on-screen announcement, or `null` if
   * nothing is being displayed.
   */
  getCurrentText(): string | null {
    return this.current ? this.current.text : null
  }

  /**
   * Clear all pending announcements and the current display.
   * Useful on game reset.
   */
  clear(): void {
    this.queue = []
    this.current = null
    this.currentStartTime = 0
    this.nextAllowedTime = 0
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private showAnnouncement(entry: QueuedAnnouncement, now: number): void {
    this.current = entry
    this.currentStartTime = now
    this.nextAllowedTime = now + MIN_GAP_MS
    playSound(entry.sound)
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers (random pick utilities for event callouts)
// ---------------------------------------------------------------------------

const DEKE_LINES = ['What a move!', 'He dekes!', 'Silky smooth!']
const HIT_LINES = ['Ouch!', 'Big hit!', "He'll feel that one!"]

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ---------------------------------------------------------------------------
// Pre-built announcement triggers
//
// These are optional convenience functions that main.ts can import and call
// directly instead of manually calling `announcer.announce()`.
// ---------------------------------------------------------------------------

export function announceGameStart(a: Announcer): void {
  a.announce("Let's drop the puck!", 'go', 5)
}

export function announceFirstCoin(a: Announcer): void {
  a.announce("He's picking up speed!", 'coin', 2)
}

export function announceMultiplier5x(a: Announcer): void {
  a.announce("He's on fire!", 'combo', 3)
}

export function announceDekeSuccess(a: Announcer): void {
  a.announce(pick(DEKE_LINES), 'deke', 3)
}

export function announceCombo(a: Announcer, comboName: string): void {
  a.announce(`COMBO! ${comboName}!`, 'combo', 4)
}

export function announceHitObstacle(a: Announcer): void {
  a.announce(pick(HIT_LINES), 'hit', 2)
}

export function announceGameOver(a: Announcer): void {
  a.announce("And that's the game!", 'game_over', 5)
}

export function announceNewHighScore(a: Announcer): void {
  a.announce('NEW HIGH SCORE!', 'silky_mitts', 5)
}

export function announceSpeedMilestone(a: Announcer): void {
  a.announce('Picking up the pace!', 'coin', 2)
}

export function announceLifeLost(a: Announcer): void {
  a.announce("He's shaken up!", 'life_lost', 3)
}

export function announceDekeUnlocked(a: Announcer): void {
  a.announce('Deke is ready!', 'deke', 4)
}
