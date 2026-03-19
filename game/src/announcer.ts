/**
 * Hockey play-by-play announcer system with voice synthesis.
 *
 * Uses Web Speech API for spoken callouts and manages on-screen text
 * with a priority queue so announcements don't overlap.
 */

import { playSound, type SoundName } from './audio'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedAnnouncement {
  text: string
  sound: SoundName | null
  priority: number // 1 (lowest) – 5 (highest)
  voice: boolean // whether to speak it
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 1500
const DISPLAY_DURATION_MS = 2000

// ---------------------------------------------------------------------------
// Voice synthesis
// ---------------------------------------------------------------------------

let voiceReady = false
let selectedVoice: SpeechSynthesisVoice | null = null

function initVoice(): void {
  if (voiceReady) return
  if (!('speechSynthesis' in window)) return

  const pickVoice = () => {
    const voices = speechSynthesis.getVoices()
    // Prefer an English voice with "Daniel", "Alex", "Samantha", or any en- voice
    selectedVoice =
      voices.find(v => v.name.includes('Daniel') && v.lang.startsWith('en')) ||
      voices.find(v => v.name.includes('Alex') && v.lang.startsWith('en')) ||
      voices.find(v => v.name.includes('Samantha') && v.lang.startsWith('en')) ||
      voices.find(v => v.lang.startsWith('en')) ||
      voices[0] || null
    voiceReady = true
  }

  if (speechSynthesis.getVoices().length > 0) {
    pickVoice()
  } else {
    speechSynthesis.addEventListener('voiceschanged', pickVoice, { once: true })
  }
}

function speak(text: string): void {
  if (!voiceReady || !selectedVoice) return
  // Strip emoji for cleaner speech
  const clean = text.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]|[⚡⏩🎯]/gu, '').trim()
  if (!clean) return

  // Cancel any current speech to avoid queue backup
  speechSynthesis.cancel()

  const utter = new SpeechSynthesisUtterance(clean)
  utter.voice = selectedVoice
  utter.rate = 1.3 // slightly fast for excitement
  utter.pitch = 1.1
  utter.volume = 0.8
  speechSynthesis.speak(utter)
}

// ---------------------------------------------------------------------------
// Announcer
// ---------------------------------------------------------------------------

export class Announcer {
  private queue: QueuedAnnouncement[] = []
  private current: QueuedAnnouncement | null = null
  private currentStartTime = 0
  private nextAllowedTime = 0

  constructor() {
    initVoice()
  }

  announce(text: string, sound: SoundName | null, priority = 2, voice = true): void {
    const entry: QueuedAnnouncement = { text, sound, priority, voice }

    // Higher priority interrupts current
    if (this.current && priority > this.current.priority) {
      this.showAnnouncement(entry, performance.now())
      return
    }

    // Insert sorted by priority descending
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

  update(now: number): void {
    if (this.current && now >= this.currentStartTime + DISPLAY_DURATION_MS) {
      this.current = null
    }

    if (!this.current && this.queue.length > 0 && now >= this.nextAllowedTime) {
      const next = this.queue.shift()!
      this.showAnnouncement(next, now)
    }
  }

  getCurrentText(): string | null {
    return this.current ? this.current.text : null
  }

  clear(): void {
    this.queue = []
    this.current = null
    this.currentStartTime = 0
    this.nextAllowedTime = 0
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel()
    }
  }

  private showAnnouncement(entry: QueuedAnnouncement, now: number): void {
    this.current = entry
    this.currentStartTime = now
    this.nextAllowedTime = now + MIN_GAP_MS
    if (entry.sound) {
      playSound(entry.sound)
    }
    if (entry.voice) {
      speak(entry.text)
    }
  }
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

const DEKE_LINES = ['🏒 Sick deke!', '🔥 Filthy!', '✨ Silky smooth!']
const HIT_LINES = ['💥 Ouch!', '😵 Big hit!', '🧱 Boards!']

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function announceGameStart(a: Announcer): void {
  a.announce('🏒 Drop the puck!', null, 5)
}

export function announceFirstCoin(a: Announcer): void {
  a.announce('💰 Nice!', null, 2)
}

export function announceMultiplier5x(a: Announcer): void {
  a.announce('🔥 ON FIRE! 🔥', 'combo', 3)
}

export function announceDekeSuccess(a: Announcer): void {
  a.announce(pick(DEKE_LINES), null, 3)
}

export function announceCombo(a: Announcer, comboName: string): void {
  a.announce(`⚡ ${comboName}! ⚡`, null, 4)
}

export function announceHitObstacle(a: Announcer): void {
  a.announce(pick(HIT_LINES), null, 3)
}

export function announceGameOver(a: Announcer): void {
  a.announce('🏁 Game over!', null, 5)
}

export function announceNewHighScore(a: Announcer): void {
  a.announce('🏆 NEW HIGH SCORE! 🏆', 'silky_mitts', 5)
}

export function announceSpeedMilestone(a: Announcer): void {
  a.announce('⏩ Faster!', 'coin', 2)
}

export function announceLifeLost(a: Announcer): void {
  a.announce('💔 Ooof!', null, 4) // bumped priority so it shows
}

export function announceDekeUnlocked(a: Announcer): void {
  a.announce('🎯 Deke unlocked!', 'deke', 4)
}

// ---------------------------------------------------------------------------
// Tutorial announcements
// ---------------------------------------------------------------------------

export function announceTutorialLanes(a: Announcer): void {
  a.announce('🏒 Switch between all 3 lanes!', null, 4)
}
export function announceTutorialObstacles(a: Announcer): void {
  a.announce('⚠️ Dodge the obstacles!', null, 4)
}
export function announceTutorialCoins(a: Announcer): void {
  a.announce('💰 Collect the coins!', null, 4)
}
export function announceTutorialStickhandling(a: Announcer): void {
  a.announce('🏒 Stickhandle for bonus points!', null, 4)
}
