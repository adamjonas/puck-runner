# Stickhandling Challenge Mode — Implementation Plan

## Context

Kids practice stickhandling during runner games, but the score is buried in the overall run score. There's no way to isolate and compete on stickhandling alone. This plan adds a dedicated **Stickhandling Challenge Mode** — a 30-second timed challenge where the player stickhandles as fast as possible, with its own leaderboard.

This also introduces a lightweight **GameMode** abstraction so future modes (shootout, etc.) slot in cleanly without duplicating structural work.

### Design Decisions (from CEO + Eng review)
- **Duration:** 30 seconds fixed
- **Counting:** Half-cycle (each direction change = 1 stickhandle), counted on iOS and sent directly
- **Visuals:** Overlay-only — top-down pad view mirroring the physical surface with grid lines (no 3D rink)
- **Ball lost:** Pause timer (1s grace for ball-lost; immediate pause on tracker disconnect)
- **No tracker:** Block start, show "Connect iPhone to play" message
- **UX flow:** Profile first → mode picker → start (tutorial skipped for challenge mode)
- **Profile stats:** Per-mode (add `stickhandlingBest` field), shown on profile cards
- **Replay:** Stays in same mode; menu returns to title with mode reset

---

## Architecture

```
iPhone PositionClassifier
  │ detectStickhandling() → frequency, amplitude, active, stickhandleCount (NEW)
  ▼
TrackingInput.stickhandling { active, frequency, amplitude, stickhandleCount }
  │ WebSocket @ 30Hz
  ▼
InputManager.handleTrackingInput()
  │ resolveControllableTracking() → stickhandlingActive, frequency
  │ Store input.stickhandling.stickhandleCount on state (NEW)
  ▼
GameState
  │ .mode = 'runner' | 'stickhandling_challenge'
  │ .stickhandleCount (delta from iOS count)
  │ .challengeStart, .challengeDuration, .totalPausedDuration, .pauseStartedAt
  ▼
GameRuntime.update()
  │ screen='playing' + mode='stickhandling_challenge'
  │   → update timer (subtract paused time)
  │   → read iOS count delta → update stickhandleCount
  │   → skip obstacles/coins/runner-scoring
  │   → check pause conditions (ball lost OR tracker disconnect)
  │   → timer expired → game_over
  ▼
StickhandlingOverlayView (pad visual + timer + count)
  ▼
GameOverOverlayView (mode-aware: show count, best, rate)
```

---

## Files to Modify

### iOS (Swift)
- **`ios/PuckTracker/Sources/PositionClassifier.swift`** — Add `@Published var stickhandleCount: Int = 0`. Increment ONLY inside the validated stickhandling block (after frequency/amplitude checks pass, not at the raw direction-reversal point at line 178). This ensures noise/jitter below the amplitude threshold doesn't inflate the count.
- **`ios/PuckTracker/Sources/TrackingPipeline.swift`** (or wherever the WS message is built) — Include `stickhandleCount` in the `stickhandling` payload. Note: Swift mirrors protocol.ts types manually.

### Shared types
- **`shared/protocol.ts`** — Add `GameMode = 'runner' | 'stickhandling_challenge'` type. Add `stickhandleCount: number` to `TrackingInput.stickhandling`.

### Game state
- **`game/src/game-state.ts`** — Add fields:
  - `mode: GameMode` (default `'runner'`)
  - `stickhandleCount: number` (game-side count from iOS deltas)
  - `challengeStart: number` (timestamp when playing began)
  - `challengeDuration: number` (30_000ms)
  - `totalPausedDuration: number` (accumulated pause time)
  - `pauseStartedAt: number` (0 when not paused)
  - `lastKnownIosCount: number` (for computing deltas)
  - `challengeResultRecorded: boolean` (single-shot persist guard)
  - Update `reset()` to clear all challenge fields, reset `mode` to `'runner'`
  - Update `startCountdown(now, mode)` to accept mode parameter, set mode AFTER reset
  - Update `beginPlaying(now)` to seed `challengeStart = now` and `lastKnownIosCount` (NOT in `startStickhandlingChallenge` — avoids counting during countdown)
  - Update state machine comment to note mode dimension
- **`game/src/game-state-types.ts`** — Add challenge fields to `RunState` if applicable

### Game runtime
- **`game/src/game-runtime.ts`** — In `updatePlaying()`, branch on `state.mode`:
  - `'runner'` → existing logic (unchanged)
  - `'stickhandling_challenge'`:
    - Compute effective elapsed: `(now - state.challengeStart) - state.totalPausedDuration`
    - `timeRemaining = Math.max(0, state.challengeDuration - effectiveElapsed)`
    - If `timeRemaining === 0` → transition to `game_over`
    - Read iOS count delta: `input.lastStickhandleCount - state.lastKnownIosCount` → add to `state.stickhandleCount`
    - Skip `spawnObstacle`, `spawnCoins`, `updateObstacles`, `updateCoins`, `checkCollisions`
    - Skip `state.updateSpeed()`
  - Extend `shouldPauseForLostTracking()`: also pause when `trackerConnected === false` during challenge mode (immediate, no grace period)
  - In `updatePaused()`: set `pauseStartedAt` on entry; on resume, add `(now - pauseStartedAt)` to `totalPausedDuration`. **Anti-exploit:** on resume, also update `lastKnownIosCount` to current iOS count to discard any stickhandles done while paused.
  - Add early return after setting `screen = 'paused'` in `updatePlaying()` to prevent executing gameplay logic on the pause frame

### New: Stickhandling scoring
- **`game/src/stickhandling-scoring.ts`** (NEW) — Pure functions:
  ```
  resolveChallengeClock(params: {
    challengeStart: number
    challengeDuration: number
    totalPausedDuration: number
    now: number
  }) → { timeRemaining: number, isExpired: boolean }
  ```
  - `timeRemaining = Math.max(0, challengeDuration - ((now - challengeStart) - totalPausedDuration))`
  - Guard: `if (!isFinite(timeRemaining)) return { timeRemaining: 0, isExpired: true }`

  ```
  resolveStickhandleCountDelta(params: {
    iosCount: number
    lastKnownIosCount: number
  }) → { countDelta: number }
  ```
  - `countDelta = Math.max(0, iosCount - lastKnownIosCount)`
  - Guard: `if (!isFinite(iosCount)) return { countDelta: 0 }`
  - **Counter-reset detection:** if `iosCount < lastKnownIosCount`, treat as epoch reset: set `lastKnownIosCount = 0`, delta = `iosCount`

### New: Stickhandling overlay
- **`game/src/stickhandling-overlay-view.ts`** (NEW) — DOM overlay following `HudOverlayView` pattern:
  - **Pad visual:** Canvas element rendering top-down playing surface with lane grid lines (left/center/right zones using protocol.ts `LANE_BOUNDARIES` constants — note: iOS calibration overrides are NOT sent to browser, so use the shared defaults). Puck dot at `state.rawX` position. Fade dot opacity when `state.confidence < 0.3`.
  - **Countdown timer:** Large text showing seconds remaining (floor integer)
  - **Stickhandle count:** Large number, updates in real-time
  - **Paused state:** "Ball Lost — move puck back into view" overlay
  - Constructor creates DOM elements; `update(state)` renders

### Overlay controller
- **`game/src/ui-overlay.ts`** — Import and register `StickhandlingOverlayView`. During `'playing'`/`'countdown'` screens, show `HudOverlayView` when `mode='runner'`, show `StickhandlingOverlayView` when `mode='stickhandling_challenge'`

### Title screen / mode picker
- **`game/src/title-overlay-view.ts`** — After profile is selected, show mode picker:
  - Two buttons/cards: "Runner" (always enabled) | "Stickhandling Challenge" (disabled + "Connect iPhone" hint when `!state.trackerConnected`)
  - Space/Enter starts the selected mode
  - Default selection: Runner
  - Mode picker only appears for game start, NOT for practice

### Game session controller
- **`game/src/game-session-controller.ts`**:
  - Add `startStickhandlingChallenge(now)`:
    ```
    private startStickhandlingChallenge(now: number): void {
      this.resetSessionSystems()
      this.state.startCountdown(now, 'stickhandling_challenge')
      // startCountdown calls reset() first, then sets mode after
      this.state.stickhandleCount = 0
      this.state.challengeDuration = 30_000
      // NOTE: lastKnownIosCount and challengeStart are seeded in beginPlaying(),
      // NOT here — avoids counting stickhandles during countdown
    }
    ```
  - **Mode-aware replay:** `onReplayRequested` checks `state.mode`:
    - `'runner'` → `startNewRun(now)` (existing)
    - `'stickhandling_challenge'` → `startStickhandlingChallenge(now)`
  - **Tutorial bypass:** When mode is `'stickhandling_challenge'`, skip tutorial check in `startNewRun()`
  - **Mode-aware start:** `onStartRequested` must route through mode selection (not always `startNewRun()`). Space/Enter on title starts the selected mode from the mode picker.
  - Wire mode picker callback from `OverlayController` (`onModeSelected`)
  - On game over for challenge: persist via `recordChallengeResult(name, count)` — guarded by `challengeResultRecorded` flag (single-shot, prevents per-frame persistence at 60fps)

### Game over
- **`game/src/game-over-overlay-view.ts`** — Mode-aware display:
  - Runner: existing behavior (score, duration, high score)
  - Stickhandling: count, best count, rate (count / 30 = handles/sec), contextual message
  - Count=0: "No stickhandles detected. Make sure your puck is moving side to side!"
  - New best: celebration (reuse `isNewHighScore` pattern → `isNewBestCount`)
  - Action cards: "Hold Left For Menu" | "Hold Right To Play Again" (same as runner)

### Profiles
- **`game/src/profiles.ts`** — Add `stickhandlingBest: number` to `PlayerProfile` (default 0)
- **`game/src/profile-store.ts`** — In `isValidProfile()`, backfill: `if (typeof obj.stickhandlingBest !== 'number') obj.stickhandlingBest = 0`
- **`game/src/profiles.ts`** — CRITICAL: Update `mergeBuiltinProfile()` (line ~236), `normalizeCustomProfile()` (line ~249), and `buildPersistedProfiles()` to include `stickhandlingBest`. Without this, the field gets dropped on every save/load cycle.
- Add `recordChallengeResult(name: string, count: number)` — updates `stickhandlingBest` if `count > profile.stickhandlingBest`, increments `gamesPlayed`
- **`game/src/title-overlay-parts.ts`** (NOT `title-overlay-view.ts`) — Profile cards: show `stickhandlingBest` alongside `highScore` (e.g., "Best Run: 1,250 | Best Stickhandling: 42"). Card rendering lives in `title-overlay-parts.ts`.

### Renderer
- **`game/src/renderer.ts`** — In `render()`, when `state.mode === 'stickhandling_challenge'`: clear the renderer (`renderer.clear()`) on first challenge frame to avoid stale rink/avatar frozen behind overlay, then early return. Use a flag to clear only once. When mode returns to `'runner'`, rendering resumes automatically on next frame.

---

## Implementation Order

1. **iOS: Add stickhandleCount** — `PositionClassifier.swift` + `TrackingPipeline.swift`
2. **Protocol types** — `GameMode` + `stickhandleCount` in `shared/protocol.ts`
3. **GameState fields** — `mode`, `stickhandleCount`, timer fields, update `reset()` + `startCountdown()`
4. **Stickhandling scoring** — Pure functions + tests (TDD)
5. **GameRuntime branching** — Mode dispatch in `updatePlaying()`, extended pause logic
6. **Profile extension** — `stickhandlingBest` field + migration + `recordChallengeResult()`
7. **Stickhandling overlay** — Pad visual + countdown + count display
8. **OverlayController** — Mode-aware overlay selection
9. **Title screen mode picker** — Mode buttons + tracker-connected gating + stickhandlingBest on cards
10. **Game session controller** — `startStickhandlingChallenge()` + mode-aware replay + wiring
11. **Game over** — Mode-aware display
12. **Renderer skip** — Early return during challenge mode

---

## Error Handling

| Error | Guard | Location |
|---|---|---|
| NaN/invalid stickhandleCount from iOS | `if (!isFinite(iosCount)) return { countDelta: 0 }` | `stickhandling-scoring.ts` |
| Old profile missing `stickhandlingBest` | Default to `0` in `isValidProfile()` | `profile-store.ts` |
| No tracker → start challenge | Disable button, show "Connect iPhone" hint | `title-overlay-view.ts` |
| Timer goes negative | `Math.max(0, timeRemaining)` | `stickhandling-scoring.ts` |
| Count=0 at game over | Graceful "keep practicing" message | `game-over-overlay-view.ts` |
| `startCountdown()` resets mode | Set mode AFTER `reset()` via `startCountdown(now, mode)` | `game-state.ts` |
| Tracker disconnect mid-challenge | Immediate pause (no grace period) | `game-runtime.ts` |
| Replay routes to wrong mode | `onReplayRequested` checks `state.mode` | `game-session-controller.ts` |
| Pause exploit (count farming) | Snapshot iOS count on pause; discard delta on resume | `game-runtime.ts` |
| iOS counter reset (app restart) | Detect `iosCount < lastKnownIosCount` → epoch reset | `stickhandling-scoring.ts` |
| Profile field dropped on save | Add `stickhandlingBest` to merge/normalize/build functions | `profiles.ts` |
| Persist runs every frame | `challengeResultRecorded` single-shot flag | `game-state.ts` |
| Stale 3D under overlay | Clear renderer on first challenge frame | `renderer.ts` |
| Count during countdown | Seed `lastKnownIosCount` in `beginPlaying()`, not before | `game-state.ts` |
| Space bypasses mode picker | `onStartRequested` routes through mode selection | `game-session-controller.ts` |
| Noise counts before validation | Increment count inside validated block only | `PositionClassifier.swift` |

---

## Verification

### Unit tests (TDD)
- **`stickhandling-scoring.test.ts`** (NEW):
  - `resolveChallengeClock`: timer countdown, pause duration handling, expiry at exactly 0, negative guard
  - `resolveStickhandleCountDelta`: normal delta, NaN guard, count jump (missed frames), count=0, **counter-reset detection (iosCount < lastKnown)**
- **`profiles.test.ts`**:
  - `stickhandlingBest` persistence, old profile migration defaults to 0
  - `recordChallengeResult` updates best when beaten, doesn't downgrade
  - **Field survival:** `stickhandlingBest` survives load→save round-trip for both builtin and custom profiles (mergeBuiltinProfile + normalizeCustomProfile must preserve it)
- **`game-state.test.ts`**:
  - Mode field defaults to 'runner'
  - `startCountdown(now, 'stickhandling_challenge')` sets mode after reset
  - `reset()` clears mode back to 'runner'
  - Challenge state fields cleared on reset
- **`game-runtime.test.ts`** (or integration):
  - Mode='stickhandling': no obstacles/coins spawned
  - Timer expires → screen transitions to game_over
  - Tracker disconnect → immediate pause
  - Ball lost → pause with grace period → resume
  - Repeated pause/resume cycles → totalPausedDuration accumulates correctly
  - **Pause anti-exploit:** stickhandles during pause not counted (lastKnownIosCount updated on resume)
  - **No counting during countdown:** stickhandles before beginPlaying() not counted
  - **Persist guard:** game_over → recordChallengeResult called exactly once, not per-frame
- **`game-session-controller.test.ts`** (or integration):
  - Replay after challenge → stays in challenge mode
  - Menu after challenge → mode resets to runner
  - Stickhandling mode skips tutorial check

### Manual testing
- Start game → select profile → see mode picker → select "Runner" → verify existing game works unchanged
- Select "Stickhandling Challenge" with tracker connected → countdown → stickhandle for 30s → game over shows count
- Select "Stickhandling Challenge" without tracker → button disabled, hint shown
- Mid-challenge: remove ball from camera → verify timer pauses → put ball back → timer resumes
- Mid-challenge: disconnect iPhone → verify immediate pause → reconnect → resumes
- Game over: check "best" updates correctly across multiple attempts
- Game over: press replay → starts another stickhandling challenge (not runner)
- Game over: press menu → returns to title, mode picker shows again
- Profile cards on title screen show stickhandlingBest
- Return to menu → switch profiles → verify per-profile stickhandling bests

### Run existing tests
`cd game && npm test` — verify no regressions in runner mode
