# TODOS

## Deferred from CEO Plan Review (2026-03-18)

### P2 — Do after core game is playable

- [ ] **Tracker SDK separation** — Refactor the iPhone tracker into a game-agnostic SDK so game #2 (air hockey, target practice, etc.) doesn't require rewriting tracking code. Currently the tracker will be coupled to the runner's input needs. Decoupling unlocks the platform play identified in the 10x vision. Effort: M (human: ~3 days) → CC: S (~30 min). Depends on: Phase 2 complete.

- [ ] **Paid Apple Developer account** — Upgrade from free dev account to paid ($99/yr) for TestFlight distribution. Eliminates the 7-day Xcode re-signing requirement and enables sharing with family members' phones. Effort: S (~30 min setup). Depends on: Prototype proving the concept is fun.

- [ ] **Startup automation script** — Shell/npm script that starts Vite dev server and auto-opens Chrome in full-screen kiosk mode on the correct URL. Reduces game night startup from 6 manual steps to 1 command. Effort: S (human: ~1 hr / CC: ~5 min). Depends on: Vite dev server working.

- [ ] **Bonjour/mDNS auto-discovery** — Advertise the Vite WS server via Bonjour from the Mac so the iPhone auto-discovers the game server on the local network without manual IP entry. Kids can't type IP addresses. Effort: S (human: ~4 hrs / CC: ~10 min). Depends on: WS server running, iOS networking code.

### Design debt (from design review 2026-03-19)

- [ ] **DESIGN.md creation** — Establish a formal design system document with color tokens, typography scale, spacing system, and component vocabulary. Currently colors and fonts are hardcoded across renderer.ts and ui-overlay.ts with no shared reference. Run `/design-consultation` to generate. Effort: S (CC: ~15 min). Depends on: Nothing.

- [ ] **First-time onboarding tutorial** — Step-by-step animated flow for new players explaining puck tracking setup, camera mounting, and basic controls. Currently new players only see text instructions. Effort: M (human: ~2 days / CC: ~20 min). Depends on: Core game stable.

- [x] **Game over celebration** — Better end-of-game experience: animated score counting, personal best callout, encouraging messages for short runs ("Nice try! You lasted Xs"), celebratory effects for high scores. Currently game over is flat text. Effort: S (CC: ~10 min). Depends on: Nothing.

- [ ] **Responsive text scaling** — Scale HUD text and overlays based on viewport size so the game is readable on small laptops (not just TVs). Use CSS clamp() or viewport units. Effort: S (CC: ~10 min). Depends on: Nothing.

- [ ] **Accessibility (ARIA + focus management)** — Add ARIA labels to overlay elements, manage focus for profile selector keyboard nav, ensure all interactive elements have visible focus indicators. Effort: S (CC: ~10 min). Depends on: Nothing.

### P3 — Polish / Nice-to-have

- [ ] **Coach heatmap** — Post-game visualization on iPhone showing where the player moved the puck on the surface during the run. Helps kids see movement patterns and improve stick control. Accumulate position samples during gameplay, render as a heatmap overlay on the calibrated surface view. Effort: S (human: ~4 hours) → CC: S (~10 min). Depends on: Phase 2 position data accumulation.

- [ ] **WebRTC upgrade for Camera PiP** — Evaluate upgrading Camera PiP from JPEG-over-WebSocket (5fps) to WebRTC for smoother, lower-latency video in the PiP window. Only pursue if JPEG quality proves insufficient for the small PiP window. Effort: M (human: ~2 days) → CC: S (~30 min). Depends on: Camera PiP working with JPEG first.
