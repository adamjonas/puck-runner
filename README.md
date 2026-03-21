# Puck Runner

Puck Runner is a local multiplayer setup built from two pieces:

- a browser game in [`game/`](./game)
- an iPhone tracker app in [`ios/PuckTracker/`](./ios/PuckTracker)

The phone tracks ball position from the camera feed, classifies lane/deke/stickhandling input, and streams it over WebSocket to the game. Shared protocol and threshold configuration live in [`shared/`](./shared).

## Repo Layout

- [`game/`](./game): Vite + TypeScript game client, local relay server, tests
- [`ios/PuckTracker/`](./ios/PuckTracker): SwiftUI tracker app
- [`shared/protocol.ts`](./shared/protocol.ts): shared message types and endpoint constants
- [`shared/tracker-config.json`](./shared/tracker-config.json): shared tracker thresholds and WebSocket config

## Requirements

- Node.js 20+ and npm
- Xcode for the iPhone app
- An iPhone on the same local network as the machine running the game

## Game Setup

Install dependencies:

```bash
cd game
npm install
```

Start the local game and relay server:

```bash
npm run dev
```

The Vite dev server listens on `0.0.0.0:5173`, so other devices on your network can reach it. The relay endpoints are:

- tracker: `ws://<host>:5173/ws/tracker`
- game: `ws://<host>:5173/ws/game`

Other useful commands:

```bash
npm run test:run
npm run build
npm run generate:shared-config
```

## iPhone Tracker Setup

Open [`ios/PuckTracker/PuckTracker.xcodeproj`](./ios/PuckTracker/PuckTracker.xcodeproj) in Xcode.

Before running on a device:

1. Sign in to Xcode with an Apple ID.
2. Select the `PuckTracker` target.
3. In `Signing & Capabilities`, enable automatic signing and choose a development team.
4. If Xcode asks, use a unique bundle identifier for your local build.

The app’s settings screen lets you enter the host running the Vite server. That host should be the LAN IP of your development machine, not `localhost`.

## Shared Config

The game and tracker share lane boundaries, deke thresholds, WebSocket paths, and message type constants through [`shared/tracker-config.json`](./shared/tracker-config.json).

When that config changes, regenerate the Swift mirror:

```bash
cd game
npm run generate:shared-config
```

This updates [`SharedTrackerConfig.swift`](./ios/PuckTracker/Sources/SharedTrackerConfig.swift).

## Notes

- The browser game requires WebGL.
- Swift/Xcode module caches are ignored in git via [`.gitignore`](./.gitignore).
- This repo currently has no root Node workspace; run npm commands from [`game/`](./game).
