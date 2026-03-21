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
import {
  resolveCoinCollectionEffects,
  resolveHitEffects,
  resolveSpeedAnnouncements,
  resolveStickhandlingUpdate,
  resolveSurvivalScore,
  type ScoringAnnouncement,
} from './scoring-rules'

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
    const resolution = resolveHitEffects({
      lives: this.state.lives,
      score: this.state.score,
      highScore: this.state.highScore,
      playerName: this.state.playerName,
    })

    for (const sound of resolution.sounds) {
      playSound(sound)
    }
    if (resolution.clearAnnouncer) {
      this.announcer.clear()
    }
    this.emitAnnouncements(resolution.announcements)
    if (resolution.muteAudio) {
      muteAudio()
    }
    if (resolution.persistRunScore !== null) {
      recordRunResult(this.state.playerName, { score: resolution.persistRunScore })
    }

    this.state.breakStreak()
  }

  private collectPlayingCoins(now: number, events: GameEvent[]): void {
    const collected = collectCoins(this.state)
    const resolution = resolveCoinCollectionEffects({
      collected,
      firstCoinAnnounced: this.state.run.firstCoinAnnounced,
      multiplier: this.state.multiplier,
      onFireAnnounced: this.state.run.onFireAnnounced,
      lane: this.state.lane,
      now,
    })
    if (resolution.sounds.length === 0) return

    for (const sound of resolution.sounds) {
      playSound(sound)
    }
    events.push(...resolution.events)
    this.state.run.firstCoinAnnounced = resolution.firstCoinAnnounced
    this.state.run.onFireAnnounced = resolution.onFireAnnounced
    this.emitAnnouncements(resolution.announcements)
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
    const resolution = resolveStickhandlingUpdate({
      screen: this.state.screen,
      stickhandlingActive: this.state.stickhandlingActive,
      stickhandlingFrequency: this.state.stickhandlingFrequency,
      lastStickhandlingTick: this.state.run.lastStickhandlingTick,
      stickhandlingStreakStart: this.state.stickhandlingStreakStart,
      silkyMittsAwarded: this.state.silkyMittsAwarded,
      now,
    })

    if (resolution.scoreDelta > 0) {
      this.state.addScore(resolution.scoreDelta)
    }
    this.state.run.lastStickhandlingTick = resolution.lastStickhandlingTick
    this.state.silkyMittsAwarded = resolution.silkyMittsAwarded
    if (resolution.comboText !== null && resolution.comboTextUntil !== null) {
      this.state.comboText = resolution.comboText
      this.state.comboTextUntil = resolution.comboTextUntil
    }
    if (resolution.sound) {
      playSound(resolution.sound)
    }
  }

  private updateSurvivalScore(now: number): void {
    const resolution = resolveSurvivalScore({
      lastSurvivalTick: this.state.run.lastSurvivalTick,
      now,
    })
    if (resolution.scoreDelta > 0) {
      this.state.score += resolution.scoreDelta
    }
    this.state.run.lastSurvivalTick = resolution.lastSurvivalTick
  }

  private updateDekeState(now: number): void {
    if (this.state.dekeActive && now > this.state.dekeInvincibleUntil) {
      this.state.dekeActive = false
    }
  }

  private updateSpeedAnnouncements(): void {
    const resolution = resolveSpeedAnnouncements({
      speed: this.state.speed,
      lastSpeedMilestone: this.state.run.lastSpeedMilestone,
      isDekeUnlocked: this.state.isDekeUnlocked,
      dekeUnlockAnnounced: this.state.run.dekeUnlockAnnounced,
    })
    this.state.run.lastSpeedMilestone = resolution.lastSpeedMilestone
    this.state.run.dekeUnlockAnnounced = resolution.dekeUnlockAnnounced
    this.emitAnnouncements(resolution.announcements)
  }

  private emitAnnouncements(announcements: ScoringAnnouncement[]): void {
    for (const announcement of announcements) {
      switch (announcement) {
        case 'deke_success':
          announceDekeSuccess(this.announcer)
          break
        case 'first_coin':
          announceFirstCoin(this.announcer)
          break
        case 'multiplier_5x':
          announceMultiplier5x(this.announcer)
          break
        case 'life_lost':
          announceLifeLost(this.announcer)
          break
        case 'game_over':
          announceGameOver(this.announcer)
          break
        case 'new_high_score':
          announceNewHighScore(this.announcer)
          break
        case 'speed_milestone':
          announceSpeedMilestone(this.announcer)
          break
        case 'deke_unlocked':
          announceDekeUnlocked(this.announcer)
          break
      }
    }
  }
}
