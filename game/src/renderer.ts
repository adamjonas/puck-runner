import * as THREE from 'three'
import { GameState } from './game-state'
import type { Obstacle, Coin } from './game-state'

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

const MAX_OBSTACLES = 20
const MAX_COINS = 30

// ---------------------------------------------------------------------------
// Simple particle
// ---------------------------------------------------------------------------

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  active: boolean
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class Renderer {
  // Three.js core
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera

  // Rink
  private icePlane!: THREE.Mesh
  private rinkMarkingsGroup!: THREE.Group
  private scrollOffset = 0

  // Boards
  private leftBoard!: THREE.Mesh
  private rightBoard!: THREE.Mesh

  // Lane dividers
  private laneDividers!: THREE.Group

  // Avatar
  private avatarGroup!: THREE.Group
  private avatarBody!: THREE.Mesh
  private avatarHead!: THREE.Mesh
  private avatarStick!: THREE.Mesh
  private avatarGlow!: THREE.Mesh
  private prevAvatarX = 0.5
  private leanAngle = 0

  // Obstacle pool
  private obstaclePool: THREE.Group[] = []
  private obstacleLabelPool: THREE.Sprite[] = []
  private secondLanePool: THREE.Mesh[] = []

  // Coin pool
  private coinPool: THREE.Mesh[] = []
  private coinGlowPool: THREE.Mesh[] = []

  // Particles
  private iceParticles: Particle[] = []
  private coinParticles: Particle[] = []

  // HUD overlay
  private hudContainer!: HTMLDivElement
  private hudScore!: HTMLDivElement
  private hudLives!: HTMLDivElement
  private hudMultiplier!: HTMLDivElement
  private hudDeke!: HTMLDivElement
  private hudCombo!: HTMLDivElement
  private hudSpeed!: HTMLDivElement
  private hudStickhandling!: HTMLDivElement

  // Overlay screens
  private overlayContainer!: HTMLDivElement

  // Title-screen camera orbit
  private titleAngle = 0

  // Track canvas parent for DOM injection
  private parentEl: HTMLElement

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
    this.buildRink()
    this.buildLaneDividers()
    this.buildBoards()
    this.buildAvatar()
    this.buildObstaclePool()
    this.buildCoinPool()
    this.buildParticlePool()

    // HUD / overlays
    this.parentEl = canvas.parentElement || document.body
    this.buildHUD()
    this.buildOverlay()

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
  // Rink
  // -----------------------------------------------------------------------

  private buildRink(): void {
    // Ice surface – a canvas texture with markings baked in
    const texCanvas = document.createElement('canvas')
    texCanvas.width = 512
    texCanvas.height = 2048
    const tc = texCanvas.getContext('2d')!
    // Base ice
    tc.fillStyle = '#E8F4F8'
    tc.fillRect(0, 0, 512, 2048)

    // Center red line
    tc.fillStyle = 'rgba(200, 50, 50, 0.35)'
    tc.fillRect(0, 1024 - 6, 512, 12)

    // Blue lines
    tc.fillStyle = 'rgba(50, 100, 170, 0.3)'
    tc.fillRect(0, 680 - 4, 512, 8)
    tc.fillRect(0, 1368 - 4, 512, 8)

    // Face-off circles
    tc.strokeStyle = 'rgba(200, 50, 50, 0.2)'
    tc.lineWidth = 3
    for (const cy of [680, 1368]) {
      for (const cx of [150, 362]) {
        tc.beginPath()
        tc.arc(cx, cy, 60, 0, Math.PI * 2)
        tc.stroke()
      }
    }

    // Center circle
    tc.strokeStyle = 'rgba(50, 100, 170, 0.25)'
    tc.lineWidth = 3
    tc.beginPath()
    tc.arc(256, 1024, 70, 0, Math.PI * 2)
    tc.stroke()

    const texture = new THREE.CanvasTexture(texCanvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1, 2)

    const iceGeo = new THREE.PlaneGeometry(RINK_W, RINK_L * 2)
    const iceMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.15,
      metalness: 0.05,
    })
    this.icePlane = new THREE.Mesh(iceGeo, iceMat)
    this.icePlane.rotation.x = -Math.PI / 2
    this.icePlane.receiveShadow = true
    this.scene.add(this.icePlane)

    // We'll create a second copy for seamless scrolling
    this.rinkMarkingsGroup = new THREE.Group()
    this.scene.add(this.rinkMarkingsGroup)
  }

  private buildLaneDividers(): void {
    this.laneDividers = new THREE.Group()
    const dashMat = new THREE.MeshBasicMaterial({
      color: COLORS.laneLines,
      transparent: true,
      opacity: 0.25,
    })
    const dashGeo = new THREE.PlaneGeometry(0.08, 1.5)

    for (const xPos of [
      (LANE_X.left + LANE_X.center) / 2,
      (LANE_X.center + LANE_X.right) / 2,
    ]) {
      for (let z = FAR_Z; z < NEAR_Z; z += 3) {
        const dash = new THREE.Mesh(dashGeo, dashMat)
        dash.rotation.x = -Math.PI / 2
        dash.position.set(xPos, 0.01, z)
        this.laneDividers.add(dash)
      }
    }
    this.scene.add(this.laneDividers)
  }

  private buildBoards(): void {
    const boardGeo = new THREE.BoxGeometry(BOARD_THICKNESS, BOARD_HEIGHT, RINK_L * 2)
    const boardMat = new THREE.MeshStandardMaterial({
      color: COLORS.boards,
      roughness: 0.7,
      metalness: 0.1,
    })

    this.leftBoard = new THREE.Mesh(boardGeo, boardMat)
    this.leftBoard.position.set(-RINK_W / 2 - BOARD_THICKNESS / 2, BOARD_HEIGHT / 2, 0)
    this.leftBoard.castShadow = true
    this.scene.add(this.leftBoard)

    this.rightBoard = new THREE.Mesh(boardGeo, boardMat)
    this.rightBoard.position.set(RINK_W / 2 + BOARD_THICKNESS / 2, BOARD_HEIGHT / 2, 0)
    this.rightBoard.castShadow = true
    this.scene.add(this.rightBoard)
  }

  // -----------------------------------------------------------------------
  // Avatar
  // -----------------------------------------------------------------------

  private buildAvatar(): void {
    this.avatarGroup = new THREE.Group()

    // Body — cylinder
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.6, 12)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: COLORS.avatarNormal,
      roughness: 0.4,
      metalness: 0.1,
    })
    this.avatarBody = new THREE.Mesh(bodyGeo, bodyMat)
    this.avatarBody.position.y = 1.0
    this.avatarBody.castShadow = true
    this.avatarGroup.add(this.avatarBody)

    // Head — sphere
    const headGeo = new THREE.SphereGeometry(0.4, 16, 12)
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xf5cba7,
      roughness: 0.6,
    })
    this.avatarHead = new THREE.Mesh(headGeo, headMat)
    this.avatarHead.position.y = 2.2
    this.avatarHead.castShadow = true
    this.avatarGroup.add(this.avatarHead)

    // Stick — flattened box
    const stickGeo = new THREE.BoxGeometry(0.08, 0.08, 2.2)
    const stickMat = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.6,
    })
    this.avatarStick = new THREE.Mesh(stickGeo, stickMat)
    this.avatarStick.position.set(0.7, 0.6, -0.4)
    this.avatarStick.rotation.x = 0.15
    this.avatarGroup.add(this.avatarStick)

    // Blade on stick
    const bladeGeo = new THREE.BoxGeometry(0.3, 0.06, 0.5)
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x333333 })
    const blade = new THREE.Mesh(bladeGeo, bladeMat)
    blade.position.set(0.7, 0.55, -1.5)
    this.avatarGroup.add(blade)

    // Glow sphere (invincibility indicator)
    const glowGeo = new THREE.SphereGeometry(2.0, 16, 12)
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.avatarDeke,
      transparent: true,
      opacity: 0,
      side: THREE.BackSide,
    })
    this.avatarGlow = new THREE.Mesh(glowGeo, glowMat)
    this.avatarGlow.position.y = 1.2
    this.avatarGroup.add(this.avatarGlow)

    this.avatarGroup.position.set(0, 0, AVATAR_Z)
    this.scene.add(this.avatarGroup)
  }

  // -----------------------------------------------------------------------
  // Obstacle pool
  // -----------------------------------------------------------------------

  private buildObstaclePool(): void {
    for (let i = 0; i < MAX_OBSTACLES; i++) {
      const group = new THREE.Group()
      group.visible = false

      // Main barrier box
      const geo = new THREE.BoxGeometry(RINK_W * 0.28, 1.2, 1.5)
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.obstacleRed,
        roughness: 0.5,
        metalness: 0.1,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = 0.6
      mesh.castShadow = true
      group.add(mesh)

      // Label sprite
      const label = this.makeTextSprite('')
      label.position.y = 1.8
      group.add(label)

      this.scene.add(group)
      this.obstaclePool.push(group)
      this.obstacleLabelPool.push(label)

      // Second-lane box (for gate type)
      const geo2 = new THREE.BoxGeometry(RINK_W * 0.28, 1.2, 1.5)
      const mat2 = new THREE.MeshStandardMaterial({
        color: COLORS.obstacleRed,
        roughness: 0.5,
        metalness: 0.1,
      })
      const mesh2 = new THREE.Mesh(geo2, mat2)
      mesh2.position.y = 0.6
      mesh2.castShadow = true
      mesh2.visible = false
      group.add(mesh2)
      this.secondLanePool.push(mesh2)
    }
  }

  // -----------------------------------------------------------------------
  // Coin pool
  // -----------------------------------------------------------------------

  private buildCoinPool(): void {
    for (let i = 0; i < MAX_COINS; i++) {
      const geo = new THREE.TorusGeometry(0.5, 0.15, 8, 24)
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.coin,
        emissive: COLORS.coin,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.7,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.castShadow = true
      this.scene.add(mesh)
      this.coinPool.push(mesh)

      // Glow
      const glowGeo = new THREE.SphereGeometry(0.9, 8, 6)
      const glowMat = new THREE.MeshBasicMaterial({
        color: COLORS.coin,
        transparent: true,
        opacity: 0.15,
      })
      const glow = new THREE.Mesh(glowGeo, glowMat)
      glow.visible = false
      this.scene.add(glow)
      this.coinGlowPool.push(glow)
    }
  }

  // -----------------------------------------------------------------------
  // Particles
  // -----------------------------------------------------------------------

  private buildParticlePool(): void {
    const whiteGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08)
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(whiteGeo, whiteMat)
      m.visible = false
      this.scene.add(m)
      this.iceParticles.push({
        mesh: m,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      })
    }

    const goldGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const goldMat = new THREE.MeshBasicMaterial({ color: COLORS.coin })
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(goldGeo, goldMat)
      m.visible = false
      this.scene.add(m)
      this.coinParticles.push({
        mesh: m,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      })
    }
  }

  private emitIceSpray(x: number, z: number, direction: number): void {
    let count = 0
    for (const p of this.iceParticles) {
      if (!p.active && count < 12) {
        p.active = true
        p.mesh.visible = true
        p.mesh.position.set(x, 0.1, z)
        p.velocity.set(
          direction * (2 + Math.random() * 3),
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 2,
        )
        p.life = 0
        p.maxLife = 300 + Math.random() * 200
        count++
      }
    }
  }

  private emitCoinBurst(x: number, y: number, z: number): void {
    let count = 0
    for (const p of this.coinParticles) {
      if (!p.active && count < 8) {
        p.active = true
        p.mesh.visible = true
        p.mesh.position.set(x, y, z)
        p.velocity.set(
          (Math.random() - 0.5) * 3,
          3 + Math.random() * 3,
          (Math.random() - 0.5) * 3,
        )
        p.life = 0
        p.maxLife = 400 + Math.random() * 300
        count++
      }
    }
  }

  private updateParticles(dt: number): void {
    const dtSec = dt / 1000
    const gravity = -15

    const updateList = (particles: Particle[]) => {
      for (const p of particles) {
        if (!p.active) continue
        p.life += dt
        if (p.life >= p.maxLife) {
          p.active = false
          p.mesh.visible = false
          continue
        }
        p.velocity.y += gravity * dtSec
        p.mesh.position.x += p.velocity.x * dtSec
        p.mesh.position.y += p.velocity.y * dtSec
        p.mesh.position.z += p.velocity.z * dtSec
        if (p.mesh.position.y < 0) {
          p.active = false
          p.mesh.visible = false
        }
        // Fade via scale
        const t = p.life / p.maxLife
        const s = 1 - t * t
        p.mesh.scale.setScalar(s)
      }
    }

    updateList(this.iceParticles)
    updateList(this.coinParticles)
  }

  // -----------------------------------------------------------------------
  // HUD (HTML overlay)
  // -----------------------------------------------------------------------

  private buildHUD(): void {
    this.hudContainer = document.createElement('div')
    this.hudContainer.id = 'hud-overlay'
    Object.assign(this.hudContainer.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '20',
      fontFamily: "'SF Mono', Menlo, monospace",
    } as CSSStyleDeclaration)

    // Score
    this.hudScore = this.createHudEl({
      top: '16px',
      right: '24px',
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#ffffff',
      textAlign: 'right',
    })

    // Multiplier
    this.hudMultiplier = this.createHudEl({
      top: '50px',
      right: '24px',
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#FFD700',
      textAlign: 'right',
    })

    // Lives
    this.hudLives = this.createHudEl({
      top: '16px',
      left: '24px',
      fontSize: '22px',
    })

    // Deke
    this.hudDeke = this.createHudEl({
      bottom: '80px',
      left: '50%',
      transform: 'translateX(-50%)',
      fontSize: '12px',
      color: 'rgba(46, 204, 113, 0.7)',
      textAlign: 'center',
    })

    // Combo text
    this.hudCombo = this.createHudEl({
      top: '40%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      fontSize: '36px',
      fontWeight: 'bold',
      color: '#FFD700',
      textShadow: '0 0 20px rgba(255, 215, 0, 0.5)',
      textAlign: 'center',
      transition: 'opacity 0.3s',
    })

    // Speed
    this.hudSpeed = this.createHudEl({
      bottom: '16px',
      right: '24px',
      fontSize: '11px',
      color: 'rgba(255, 255, 255, 0.3)',
    })

    // Stickhandling
    this.hudStickhandling = this.createHudEl({
      bottom: '16px',
      left: '24px',
      fontSize: '12px',
      fontWeight: 'bold',
      color: 'rgba(52, 152, 219, 0.8)',
    })

    this.parentEl.appendChild(this.hudContainer)
  }

  private createHudEl(styles: Record<string, string>): HTMLDivElement {
    const el = document.createElement('div')
    Object.assign(el.style, { position: 'absolute', ...styles })
    this.hudContainer.appendChild(el)
    return el
  }

  private updateHUD(state: GameState): void {
    const showHud =
      state.screen === 'playing' ||
      state.screen === 'countdown' ||
      state.screen === 'paused'

    this.hudContainer.style.display = showHud ? 'block' : 'none'
    if (!showHud) return

    // Score
    this.hudScore.textContent = `${state.score}`

    // Multiplier
    this.hudMultiplier.textContent =
      state.multiplier > 1 ? `${state.multiplier}x` : ''

    // Lives
    let hearts = ''
    for (let i = 0; i < 3; i++) {
      hearts += i < state.lives
        ? '<span style="color:#e74c3c">&#9829;</span>'
        : '<span style="color:rgba(255,255,255,0.2)">&#9829;</span>'
    }
    this.hudLives.innerHTML = hearts

    // Deke indicator
    const now = performance.now()
    if (!state.isDekeUnlocked) {
      const remaining = GameState.DEKE_UNLOCK_MS - state.elapsed
      if (remaining <= 10000) {
        const secs = Math.ceil(remaining / 1000)
        this.hudDeke.textContent = `DEKE in ${secs}s`
        this.hudDeke.style.color = 'rgba(255,255,255,0.3)'
      } else {
        this.hudDeke.textContent = ''
      }
    } else if (state.dekeCooldownUntil > now) {
      const remaining = (state.dekeCooldownUntil - now) / GameState.DEKE_COOLDOWN_MS
      const pct = Math.round((1 - remaining) * 100)
      this.hudDeke.textContent = `DEKE [${pct}%]`
      this.hudDeke.style.color = 'rgba(255,255,255,0.4)'
    } else if (state.screen === 'playing') {
      this.hudDeke.innerHTML = '&#8595; DEKE'
      this.hudDeke.style.color = 'rgba(46, 204, 113, 0.7)'
    }

    // Combo text
    if (state.comboText && now < state.comboTextUntil) {
      this.hudCombo.textContent = state.comboText
      this.hudCombo.style.opacity = '1'
    } else {
      this.hudCombo.style.opacity = '0'
    }

    // Speed
    this.hudSpeed.textContent = `${state.speed.toFixed(1)}x`

    // Stickhandling
    if (state.stickhandlingActive) {
      this.hudStickhandling.textContent = `STICKHANDLING ${state.stickhandlingFrequency.toFixed(1)}Hz`
    } else {
      this.hudStickhandling.textContent = ''
    }
  }

  // -----------------------------------------------------------------------
  // Overlay screens (title, countdown, game over, paused)
  // -----------------------------------------------------------------------

  private buildOverlay(): void {
    this.overlayContainer = document.createElement('div')
    this.overlayContainer.id = 'game-overlay'
    Object.assign(this.overlayContainer.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: '30',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: '#ffffff',
      textAlign: 'center',
    } as CSSStyleDeclaration)
    this.parentEl.appendChild(this.overlayContainer)
  }

  private updateOverlay(state: GameState): void {
    const now = performance.now()

    if (state.screen === 'title') {
      let html = `
        <div style="font-size:48px;font-weight:bold;margin-bottom:12px;text-shadow:0 0 30px rgba(46,204,113,0.4)">PUCK RUNNER</div>
        <div style="font-size:18px;opacity:0.5;margin-bottom:24px">Dodge obstacles &bull; Collect coins &bull; Deke for style</div>
        <div style="font-size:15px;opacity:0.7;margin-bottom:6px">Use &larr; &rarr; to move, &darr; to deke</div>
        <div style="font-size:15px;opacity:0.7;margin-bottom:28px">Press SPACE to start</div>
      `
      if (state.highScore > 0) {
        html += `<div style="font-size:18px;font-weight:bold;color:#FFD700">High Score: ${state.highScore}</div>`
      }
      html += `<div style="font-size:13px;opacity:0.3;margin-top:32px;font-family:'SF Mono',Menlo,monospace">${
        state.trackerConnected ? '&#9679; Tracker connected' : '&#9675; Keyboard mode (&larr; &rarr; &darr;)'
      }</div>`
      this.overlayContainer.innerHTML = html
      this.overlayContainer.style.background = 'rgba(0,0,0,0.45)'
      return
    }

    if (state.screen === 'countdown') {
      const remaining = Math.ceil((state.countdownEnd - now) / 1000)
      if (remaining > 0) {
        this.overlayContainer.innerHTML = `
          <div style="font-size:96px;font-weight:bold;text-shadow:0 0 40px rgba(255,255,255,0.3)">${remaining}</div>
        `
        this.overlayContainer.style.background = 'rgba(0,0,0,0.35)'
      } else {
        this.overlayContainer.innerHTML = ''
        this.overlayContainer.style.background = 'none'
      }
      return
    }

    if (state.screen === 'paused') {
      this.overlayContainer.innerHTML = `
        <div style="font-size:40px;font-weight:bold;margin-bottom:12px">PAUSED</div>
        <div style="font-size:18px;opacity:0.6">Move ball back into view</div>
      `
      this.overlayContainer.style.background = 'rgba(0,0,0,0.55)'
      return
    }

    if (state.screen === 'game_over') {
      let html = `
        <div style="font-size:44px;font-weight:bold;margin-bottom:20px">GAME OVER</div>
        <div style="font-size:32px;font-weight:bold;font-family:'SF Mono',Menlo,monospace;margin-bottom:10px">${state.score}</div>
        <div style="font-size:16px;opacity:0.5;margin-bottom:16px">Time: ${(state.elapsed / 1000).toFixed(1)}s</div>
      `
      if (state.score >= state.highScore && state.score > 0) {
        html += `<div style="font-size:20px;font-weight:bold;color:#FFD700;margin-bottom:16px">NEW HIGH SCORE!</div>`
      } else if (state.highScore > 0) {
        html += `<div style="font-size:14px;opacity:0.4;margin-bottom:16px">Best: ${state.highScore}</div>`
      }
      html += `<div style="font-size:16px;opacity:0.7;margin-top:12px">Press SPACE to play again</div>`
      this.overlayContainer.innerHTML = html
      this.overlayContainer.style.background = 'rgba(0,0,0,0.65)'
      return
    }

    // playing — clear overlay
    this.overlayContainer.innerHTML = ''
    this.overlayContainer.style.background = 'none'
  }

  // -----------------------------------------------------------------------
  // Public render
  // -----------------------------------------------------------------------

  render(state: GameState, dt: number): void {
    // Scroll the rink
    if (state.screen === 'playing' || state.screen === 'countdown') {
      this.scrollOffset += dt * state.currentSpeed * 0.06
    }

    // Update ice scroll
    const iceMat = this.icePlane.material as THREE.MeshStandardMaterial
    if (iceMat.map) {
      iceMat.map.offset.y = -this.scrollOffset * 0.05
      iceMat.map.needsUpdate = true
    }

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
    this.updateAvatar(state, dt)

    // Obstacles
    this.updateObstacles(state)

    // Coins
    this.updateCoins(state, dt)

    // Particles
    this.updateParticles(dt)

    // HUD
    this.updateHUD(state)

    // Overlay screens
    this.updateOverlay(state)

    // Render
    this.renderer.render(this.scene, this.camera)
  }

  // -----------------------------------------------------------------------
  // Avatar update
  // -----------------------------------------------------------------------

  private updateAvatar(state: GameState, dt: number): void {
    const showAvatar = state.screen === 'playing' || state.screen === 'countdown' || state.screen === 'paused'
    this.avatarGroup.visible = showAvatar
    if (!showAvatar) return

    // X position: map avatarX (0-1) to world X
    const worldX = (state.avatarX - 0.5) * RINK_W
    this.avatarGroup.position.x = worldX

    // Lean on lane change
    const dx = state.avatarX - this.prevAvatarX
    const targetLean = -dx * 40 // tilt toward direction of movement
    this.leanAngle += (targetLean - this.leanAngle) * Math.min(1, dt * 0.01)
    this.avatarGroup.rotation.z = THREE.MathUtils.clamp(this.leanAngle, -0.35, 0.35)

    // Ice spray on significant lane change
    if (Math.abs(dx) > 0.005) {
      const dir = dx > 0 ? -1 : 1
      if (Math.random() < 0.15) {
        this.emitIceSpray(worldX, AVATAR_Z, dir)
      }
    }
    this.prevAvatarX = state.avatarX

    // Color: green normally, red when deke invincible
    const bodyMat = this.avatarBody.material as THREE.MeshStandardMaterial
    const invincible = state.isDekeInvincible
    bodyMat.color.setHex(invincible ? COLORS.avatarDeke : COLORS.avatarNormal)

    // Glow sphere
    const glowMat = this.avatarGlow.material as THREE.MeshBasicMaterial
    if (invincible) {
      glowMat.opacity = 0.2 + Math.sin(performance.now() * 0.01) * 0.1
      glowMat.color.setHex(COLORS.avatarDeke)
      this.avatarGlow.visible = true
    } else {
      this.avatarGlow.visible = false
      glowMat.opacity = 0
    }
  }

  // -----------------------------------------------------------------------
  // Obstacles update
  // -----------------------------------------------------------------------

  private updateObstacles(state: GameState): void {
    const obstacles = state.obstacles

    for (let i = 0; i < MAX_OBSTACLES; i++) {
      const group = this.obstaclePool[i]
      const secondMesh = this.secondLanePool[i]

      if (i >= obstacles.length) {
        group.visible = false
        continue
      }

      const obs = obstacles[i]
      if (!obs.active) {
        group.visible = false
        continue
      }

      group.visible = true

      // Map y (0=far, 1=near) to world z
      const worldZ = FAR_Z + obs.y * (NEAR_Z - FAR_Z)
      const worldX = LANE_X[obs.lane] ?? 0
      group.position.set(worldX, 0, worldZ)

      // Colour
      const mainMesh = group.children[0] as THREE.Mesh
      const mat = mainMesh.material as THREE.MeshStandardMaterial
      mat.color.setHex(obs.type === 'zamboni' ? COLORS.obstacleOrange : COLORS.obstacleRed)

      // Label
      this.updateLabelSprite(this.obstacleLabelPool[i], obs.type)

      // Second lane (gate)
      if (obs.secondLane) {
        const x2 = LANE_X[obs.secondLane] ?? 0
        secondMesh.visible = true
        // Position relative to group
        secondMesh.position.x = x2 - worldX
        const mat2 = secondMesh.material as THREE.MeshStandardMaterial
        mat2.color.setHex(COLORS.obstacleRed)
      } else {
        secondMesh.visible = false
      }
    }
  }

  // -----------------------------------------------------------------------
  // Coins update
  // -----------------------------------------------------------------------

  private updateCoins(state: GameState, dt: number): void {
    const coins = state.coins
    const time = performance.now()

    for (let i = 0; i < MAX_COINS; i++) {
      const mesh = this.coinPool[i]
      const glow = this.coinGlowPool[i]

      if (i >= coins.length) {
        mesh.visible = false
        glow.visible = false
        continue
      }

      const coin = coins[i]

      if (!coin.active) {
        mesh.visible = false
        glow.visible = false
        continue
      }

      if (coin.collected) {
        // Scale-down animation
        const s = mesh.scale.x
        if (s > 0.01) {
          const newS = s * 0.85
          mesh.scale.setScalar(newS)
          glow.scale.setScalar(newS)
          // Emit particles on first frame of collection
          if (s > 0.9) {
            const worldX = LANE_X[coin.lane] ?? 0
            const worldZ = FAR_Z + coin.y * (NEAR_Z - FAR_Z)
            this.emitCoinBurst(worldX, 1.0, worldZ)
          }
        } else {
          mesh.visible = false
          glow.visible = false
        }
        continue
      }

      mesh.visible = true
      glow.visible = true
      mesh.scale.setScalar(1)

      const worldX = LANE_X[coin.lane] ?? 0
      const worldZ = FAR_Z + coin.y * (NEAR_Z - FAR_Z)
      const floatY = 1.0 + Math.sin(time * 0.003 + i) * 0.2

      mesh.position.set(worldX, floatY, worldZ)
      mesh.rotation.x = Math.PI / 2
      mesh.rotation.z = time * 0.002 + i // slow spin

      glow.position.set(worldX, floatY, worldZ)
    }
  }

  // -----------------------------------------------------------------------
  // Text sprite helper
  // -----------------------------------------------------------------------

  private labelCache = new Map<string, THREE.Texture>()

  private makeLabelTexture(text: string): THREE.Texture {
    const cached = this.labelCache.get(text)
    if (cached) return cached

    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, 256, 64)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 128, 32)

    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    this.labelCache.set(text, tex)
    return tex
  }

  private makeTextSprite(text: string): THREE.Sprite {
    const tex = this.makeLabelTexture(text || ' ')
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    })
    const sprite = new THREE.Sprite(mat)
    sprite.scale.set(4, 1, 1)
    return sprite
  }

  private readonly OBSTACLE_LABELS: Record<string, string> = {
    boards: 'BOARDS',
    zamboni: 'ZAMBONI',
    crack: 'CRACK',
    snow: 'SNOW',
    gate: 'GATE',
  }

  private updateLabelSprite(sprite: THREE.Sprite, type: string): void {
    const text = this.OBSTACLE_LABELS[type] || type.toUpperCase()
    const mat = sprite.material as THREE.SpriteMaterial
    const newTex = this.makeLabelTexture(text)
    if (mat.map !== newTex) {
      mat.map = newTex
      mat.needsUpdate = true
    }
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
