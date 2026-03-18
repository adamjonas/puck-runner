# Puck Runner

Endless-runner game controlled by a physical tennis ball tracked by an iPhone camera. Game renders in browser, displayed on TV.

## Architecture

```
iPhone (PuckTracker) ──WS──▶ Vite dev server (WS relay) ──▶ Browser (game)
                              ws://[host]:5173/ws/tracker      ws://[host]:5173/ws/game
```

Single Vite process serves the game AND relays WebSocket messages between iPhone tracker and browser game.

## Project Structure

- `shared/` — Shared TypeScript protocol types (single source of truth for WS messages)
- `game/` — Vite + TypeScript browser game (Canvas 2D for Phase 1, Three.js later)
- `ios/PuckTracker/` — Swift/SwiftUI iPhone tracker app

## Development

```bash
cd game && npm run dev    # Starts Vite + WS relay on :5173
npm test                  # Run Vitest tests
```

Use arrow keys (← →) to test lane switching without an iPhone. Press Space/Enter to start.

## iOS Setup

Requires Xcode. Open `ios/PuckTracker/PuckTracker.xcodeproj`, set your team, build to device.
To regenerate the Xcode project: `cd ios/PuckTracker && xcodegen generate`

## Key Decisions (from plan reviews)

- TypeScript + Vite + Vitest for game
- WS relay as Vite plugin (one process)
- Central GameState class (all mutable state)
- Input interpolation (30Hz→60fps lerp)
- Object pooling for obstacles/coins (Phase 2+)
- Auto-reconnect with exponential backoff on WS disconnect
- Ball-lost: 1s grace period, then freeze with overlay
- Lane transition: 200ms invincibility
- iOS: free dev account (re-sign weekly)
