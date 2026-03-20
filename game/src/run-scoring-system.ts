import type { CollisionResult } from './obstacles'
import { collectCoins } from './coins'
import type { GameEvent } from './combos'
import { ComboDetector } from './combos'
import { GameState } from './game-state'
import { muteAudio, playSound } from './audio'
import { recordRunResult } from './profiles'
import {
  Announcer,
  announceCombo,
  announceDekeSuccess,
  announceDekeUnlocked,
  announceFirstCoin,
  announceGameOver,
  announceLifeLost,
  announceMultiplier5x,
  announceNewHighScore,
  announceSpeedMilestone,
} from './announcer'

export class RunScoringSystem {
  private readonly comboDetector = new ComboDetector()

  constructor(
    private readonly state: GameState,
    private readonly announcer: Announcer,
  ) {}

  resetSession(): void {
    this.comboDetector.reset()
    this.announcer.clear()
  }

  update(now: number, collisionResult: CollisionResult): void {
    const events: GameEvent[] = []

    if (collisionResult === 'hit') {
      this.handleHit()
      if (this.state.screen === 'game_over') {
        return
      }
    } else if (collisionResult === 'deke_success') {
      playSound('deke')
      this.state.addScore(25)
      events.push({ type: 'deke_success', time: now })
      announceDekeSuccess(this.announcer)
    }

    this.collectPlayingCoins(now, events)
    this.updateComboAnnouncements(events)
    this.updateStickhandlingScoring(now)
    this.updateSurvivalScore(now)
    this.updateDekeState(now)
    this.updateSpeedAnnouncements()
  }

  private handleHit(): void {
    playSound('hit')
    const reachedNewHighScore = this.state.score >= this.state.highScore && this.state.score > 0

    if (this.state.lives > 0) {
      playSound('life_lost')
      announceLifeLost(this.announcer)
    } else {
      playSound('game_over')
      this.announcer.clear()
      announceGameOver(this.announcer)
      muteAudio()
      if (reachedNewHighScore) {
        announceNewHighScore(this.announcer)
      }
      if (this.state.playerName) {
        recordRunResult(this.state.playerName, { score: this.state.score })
      }
    }

    this.state.breakStreak()
  }

  private collectPlayingCoins(now: number, events: GameEvent[]): void {
    const collected = collectCoins(this.state)
    if (collected <= 0) return

    playSound('coin')
    if (!this.state.run.firstCoinAnnounced) {
      announceFirstCoin(this.announcer)
      this.state.run.firstCoinAnnounced = true
    }

    for (let i = 0; i < collected; i++) {
      events.push({ type: 'coin_collected', time: now, lane: this.state.lane })
    }

    if (this.state.multiplier < 5) {
      this.state.run.onFireAnnounced = false
    } else if (!this.state.run.onFireAnnounced) {
      this.state.run.onFireAnnounced = true
      announceMultiplier5x(this.announcer)
    }
  }

  private updateComboAnnouncements(events: GameEvent[]): void {
    for (const event of events) {
      const combo = this.comboDetector.check(this.state, event)
      if (!combo) continue
      playSound('combo')
      announceCombo(this.announcer, combo)
    }
  }

  private updateStickhandlingScoring(now: number): void {
    if (this.state.stickhandlingActive && this.state.screen === 'playing') {
      if (now - this.state.run.lastStickhandlingTick >= 1000) {
        const rate = this.state.stickhandlingFrequency >= 4.0 ? 10 : 5
        this.state.addScore(rate)
        this.state.run.lastStickhandlingTick = now
      }

      if (
        this.state.stickhandlingStreakStart > 0 &&
        !this.state.silkyMittsAwarded &&
        now - this.state.stickhandlingStreakStart >= GameState.SILKY_MITTS_THRESHOLD_MS
      ) {
        this.state.silkyMittsAwarded = true
        this.state.addScore(50)
        this.state.comboText = 'SILKY MITTS!'
        this.state.comboTextUntil = now + 2000
        playSound('silky_mitts')
      }
      return
    }

    this.state.run.lastStickhandlingTick = now
  }

  private updateSurvivalScore(now: number): void {
    if (now - this.state.run.lastSurvivalTick >= 1000) {
      this.state.score += 1
      this.state.run.lastSurvivalTick = now
    }
  }

  private updateDekeState(now: number): void {
    if (this.state.dekeActive && now > this.state.dekeInvincibleUntil) {
      this.state.dekeActive = false
    }
  }

  private updateSpeedAnnouncements(): void {
    if (this.state.speed >= this.state.run.lastSpeedMilestone + 0.5) {
      this.state.run.lastSpeedMilestone = Math.floor(this.state.speed * 2) / 2
      announceSpeedMilestone(this.announcer)
    }

    if (this.state.isDekeUnlocked && !this.state.run.dekeUnlockAnnounced) {
      this.state.run.dekeUnlockAnnounced = true
      announceDekeUnlocked(this.announcer)
    }
  }
}
