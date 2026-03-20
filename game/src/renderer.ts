import * as THREE from 'three'
import { GameState } from './game-state'
import { ObstacleViewPool } from './obstacle-view-pool'
import { CoinViewPool } from './coin-view-pool'
import { AvatarView } from './avatar-view'
import { ParticleEffects } from './particle-effects'
import { RinkView } from './rink-view'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLORS = {
  ice: 0xe8f4f8,
  laneLines: 0xa8d8ea,
  boards: 0x2c3e50,
  coin: 0xffd700,
  obstacleRed: 0xc0392b,
  obstacleOrange: 0xe67e22,
  avatarNormal: 0x2ecc71,
  avatarDeke: 0xe74c3c,
  rinkRedLine: 0xcc3333,
  rinkBlueLine: 0x3366aa,
}

/** World-space rink dimensions. */
const RINK_W = 30 // width (x)
const RINK_L = 80 // length (z, toward camera)
const BOARD_HEIGHT = 1.5
const BOARD_THICKNESS = 0.6

const LANE_X: Record<string, number> = {
  left: -RINK_W * 0.3,
  center: 0,
  right: RINK_W * 0.3,
}

const AVATAR_Z = RINK_L * 0.25 // near = positive z, avatar lives here
const FAR_Z = -RINK_L * 0.5 // far end
const NEAR_Z = RINK_L * 0.5 // near end (behind camera culled)

const MAX_COINS = 30

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  // Three.js core
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  // Rink
  private rinkView: RinkView
  private scrollOffset = 0

  // Avatar
  private avatarView: AvatarView

  // Obstacles
  private obstacleViews: ObstacleViewPool

  // Coins
  private coinViews: CoinViewPool

  // Particles
  private particleEffects: ParticleEffects

  // Title-screen camera orbit
  private titleAngle = 0

  constructor(canvas: HTMLCanvasElement) {
    // Try WebGL
    let gl: WebGLRenderingContext | null = null
    try {
      gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    } catch { /* noop */ }
    if (!gl) {
      console.warn('[Renderer] WebGL not available — 3D renderer will not work.')
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x0a1628)
    this.scene.fog = new THREE.Fog(0x0a1628, RINK_L * 0.6, RINK_L * 1.1)

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    )
    this.camera.position.set(0, 28, AVATAR_Z + 22)
    this.camera.lookAt(0, 0, AVATAR_Z - 12)

    // Lights
    this.setupLights()

    // Build scene
    this.rinkView = new RinkView({
      scene: this.scene,
      rinkWidth: RINK_W,
      rinkLength: RINK_L,
      boardHeight: BOARD_HEIGHT,
      boardThickness: BOARD_THICKNESS,
      farZ: FAR_Z,
      nearZ: NEAR_Z,
      laneX: LANE_X,
      boardColor: COLORS.boards,
      laneLineColor: COLORS.laneLines,
    })
    this.avatarView = new AvatarView({
      scene: this.scene,
      rinkWidth: RINK_W,
      avatarZ: AVATAR_Z,
      normalColor: COLORS.avatarNormal,
      dekeColor: COLORS.avatarDeke,
    })
    this.obstacleViews = new ObstacleViewPool({
      scene: this.scene,
      rinkWidth: RINK_W,
      farZ: FAR_Z,
      nearZ: NEAR_Z,
      laneX: LANE_X,
      maxObstacles: 20,
    })
    this.coinViews = new CoinViewPool({
      scene: this.scene,
      laneX: LANE_X,
      farZ: FAR_Z,
      nearZ: NEAR_Z,
      maxCoins: MAX_COINS,
      coinColor: COLORS.coin,
    })
    this.particleEffects = new ParticleEffects({
      scene: this.scene,
      coinColor: COLORS.coin,
    })
    this.obstacleViews.loadAsset('zamboni', '/models/zamboni-original.glb', RINK_W * 0.19)
    this.obstacleViews.loadAsset('crack', '/models/broken-ice-original.glb', RINK_W * 0.24)

    // Resize
    window.addEventListener('resize', () => this.onResize())
  }

  // -----------------------------------------------------------------------
  // Lights
  // -----------------------------------------------------------------------

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)

    const dir = new THREE.DirectionalLight(0xffffff, 0.9)
    dir.position.set(10, 30, 20)
    dir.castShadow = true
    dir.shadow.mapSize.set(1024, 1024)
    dir.shadow.camera.left = -RINK_W
    dir.shadow.camera.right = RINK_W
    dir.shadow.camera.top = RINK_L * 0.5
    dir.shadow.camera.bottom = -RINK_L * 0.5
    dir.shadow.camera.near = 1
    dir.shadow.camera.far = 80
    this.scene.add(dir)

    // Slight hemisphere for colour variation
    const hemi = new THREE.HemisphereLight(0xb0d8f0, 0x404060, 0.3)
    this.scene.add(hemi)
  }

  // -----------------------------------------------------------------------
  // HUD and overlays are handled by ui-overlay.ts

  // -----------------------------------------------------------------------
  // Public render
  // -----------------------------------------------------------------------

  render(state: GameState, dt: number): void {
    // Scroll the rink at the same rate obstacles approach
    const viewportHeight = this.renderer.domElement.clientHeight || window.innerHeight || 1
    if (state.screen === 'playing' || state.screen === 'countdown' || state.screen === 'tutorial') {
      const obstacleSpeed = state.currentSpeed / viewportHeight
      this.scrollOffset += obstacleSpeed * dt
    }

    // Update ice scroll
    this.rinkView.updateScroll(this.scrollOffset)

    // Camera: fixed during gameplay, orbiting on title
    if (state.screen === 'title') {
      this.titleAngle += dt * 0.0003
      const radius = 38
      this.camera.position.set(
        Math.sin(this.titleAngle) * radius * 0.3,
        28 + Math.sin(this.titleAngle * 0.7) * 3,
        AVATAR_Z + 22 + Math.cos(this.titleAngle) * 5,
      )
      this.camera.lookAt(0, 0, AVATAR_Z - 12)
    } else {
      this.camera.position.set(0, 28, AVATAR_Z + 22)
      this.camera.lookAt(0, 0, AVATAR_Z - 12)
    }

    // Avatar position & lean
    this.avatarView.update(state, dt, state.now, (x, z, direction) => {
      this.particleEffects.emitIceSpray(x, z, direction)
    })

    // Obstacles
    this.obstacleViews.update(state.obstacles)

    // Coins
    this.updateCoins(state)

    // Particles
    this.particleEffects.update(dt)

    // Render
    this.renderer.render(this.scene, this.camera)
  }

  // -----------------------------------------------------------------------
  // Coins update
  // -----------------------------------------------------------------------

  private updateCoins(state: GameState): void {
    this.coinViews.update(state.coins, state.now, (x, y, z) => {
      this.particleEffects.emitCoinBurst(x, y, z)
    })
  }

  // -----------------------------------------------------------------------
  // Resize handler
  // -----------------------------------------------------------------------

  private onResize(): void {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }
}
