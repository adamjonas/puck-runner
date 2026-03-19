import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
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

  // Obstacle pool — each entry has typed meshes: boards, zamboni, crack, snow, gate
  private obstaclePool: THREE.Group[] = []
  private obstacleTypeMeshes: Map<string, THREE.Object3D>[] = []
  private secondLanePool: THREE.Group[] = []

  // Coin pool
  private coinPool: THREE.Mesh[] = []
  private coinGlowPool: THREE.Mesh[] = []

  // Particles
  private iceParticles: Particle[] = []
  private coinParticles: Particle[] = []

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
    this.buildRink()
    this.buildLaneDividers()
    this.buildBoards()
    this.buildAvatar()
    this.buildObstaclePool()
    this.buildCoinPool()
    this.buildParticlePool()
    this.loadObstacleAsset('zamboni', '/models/zamboni-original.glb', RINK_W * 0.19)
    this.loadObstacleAsset('crack', '/models/broken-ice-original.glb', RINK_W * 0.24)

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

    // Core sphere — glowing energy ball
    const coreGeo = new THREE.SphereGeometry(0.8, 24, 18)
    const coreMat = new THREE.MeshStandardMaterial({
      color: COLORS.avatarNormal,
      emissive: COLORS.avatarNormal,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.3,
    })
    this.avatarBody = new THREE.Mesh(coreGeo, coreMat)
    this.avatarBody.position.y = 1.0
    this.avatarBody.castShadow = true
    this.avatarGroup.add(this.avatarBody)

    // Inner glow ring
    const ringGeo = new THREE.TorusGeometry(1.0, 0.08, 8, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: COLORS.avatarNormal,
      transparent: true,
      opacity: 0.5,
    })
    this.avatarHead = new THREE.Mesh(ringGeo, ringMat)
    this.avatarHead.position.y = 1.0
    this.avatarHead.rotation.x = Math.PI / 2
    this.avatarGroup.add(this.avatarHead)

    // Outer glow sphere
    const glowGeo = new THREE.SphereGeometry(1.8, 16, 12)
    const glowMat = new THREE.MeshBasicMaterial({
      color: COLORS.avatarNormal,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    })
    this.avatarGlow = new THREE.Mesh(glowGeo, glowMat)
    this.avatarGlow.position.y = 1.0
    this.avatarGroup.add(this.avatarGlow)

    // Point light on the avatar for ice reflection
    const avatarLight = new THREE.PointLight(0x2ecc71, 1.5, 12)
    avatarLight.position.y = 1.0
    this.avatarGroup.add(avatarLight)

    // Unused but kept for interface compatibility
    this.avatarStick = this.avatarBody

    this.avatarGroup.position.set(0, 0, AVATAR_Z)
    this.scene.add(this.avatarGroup)
  }

  // -----------------------------------------------------------------------
  // Obstacle pool
  // -----------------------------------------------------------------------

  private buildObstaclePool(): void {
    const laneW = RINK_W * 0.28

    for (let i = 0; i < MAX_OBSTACLES; i++) {
      const group = new THREE.Group()
      group.visible = false
      const meshes = new Map<string, THREE.Object3D>()

      // --- BOARDS: wooden wall segment ---
      const boardsGroup = new THREE.Group()
      const boardMain = new THREE.Mesh(
        new THREE.BoxGeometry(laneW, 1.8, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8, metalness: 0 }),
      )
      boardMain.position.y = 0.9
      boardMain.castShadow = true
      boardsGroup.add(boardMain)
      // Horizontal planks
      for (let p = 0; p < 3; p++) {
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(laneW + 0.2, 0.08, 0.55),
          new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.9 }),
        )
        plank.position.y = 0.4 + p * 0.6
        boardsGroup.add(plank)
      }
      boardsGroup.visible = false
      group.add(boardsGroup)
      meshes.set('boards', boardsGroup)

      // --- ZAMBONI: more recognizable ice resurfacer silhouette ---
      const zamboniGroup = new THREE.Group()
      const zWhite = new THREE.MeshStandardMaterial({ color: 0xf6f8fb, roughness: 0.35, metalness: 0.22 })
      const zBlue = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.45, metalness: 0.18 })
      const zDark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.7, metalness: 0.1 })
      const zMetal = new THREE.MeshStandardMaterial({ color: 0xa7b4c3, roughness: 0.3, metalness: 0.7 })
      const zRubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95, metalness: 0.02 })
      const zGlass = new THREE.MeshStandardMaterial({
        color: 0x8fd3ff,
        roughness: 0.05,
        metalness: 0.08,
        transparent: true,
        opacity: 0.38,
      })
      const zLight = new THREE.MeshStandardMaterial({ color: 0xfff4c2, emissive: 0xffd76a, emissiveIntensity: 0.9 })
      const zBeacon = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.9 })

      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.82, 0.38, 3.05),
        zBlue,
      )
      chassis.position.y = 0.34
      chassis.castShadow = true
      zamboniGroup.add(chassis)

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.72, 1.15, 2.2),
        zWhite,
      )
      body.position.set(0, 0.98, 0.18)
      body.castShadow = true
      zamboniGroup.add(body)

      const frontCowling = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.64, 0.72, 0.92),
        zWhite,
      )
      frontCowling.position.set(0, 0.86, -1.12)
      frontCowling.rotation.x = 0.08
      frontCowling.castShadow = true
      zamboniGroup.add(frontCowling)

      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.58, 0.14, 1.4),
        zDark,
      )
      roof.position.set(0, 2.18, -0.28)
      roof.castShadow = true
      zamboniGroup.add(roof)

      const cabBack = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.5, 0.8, 1.02),
        zWhite,
      )
      cabBack.position.set(0, 1.78, -0.25)
      cabBack.castShadow = true
      zamboniGroup.add(cabBack)

      const windshield = new THREE.Mesh(
        new THREE.PlaneGeometry(laneW * 0.46, 0.62),
        zGlass,
      )
      windshield.position.set(0, 1.86, -0.82)
      windshield.rotation.x = -0.22
      zamboniGroup.add(windshield)

      for (const side of [-1, 1]) {
        const sideWindow = new THREE.Mesh(
          new THREE.PlaneGeometry(0.72, 0.48),
          zGlass,
        )
        sideWindow.position.set(side * laneW * 0.26, 1.82, -0.22)
        sideWindow.rotation.y = side * Math.PI / 2
        zamboniGroup.add(sideWindow)

        const sideStripe = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.22, 2.08),
          zBlue,
        )
        sideStripe.position.set(side * laneW * 0.37, 0.86, 0.12)
        sideStripe.castShadow = true
        zamboniGroup.add(sideStripe)

        const fenderFront = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.26, 0.72),
          zBlue,
        )
        fenderFront.position.set(side * laneW * 0.28, 0.62, -0.86)
        fenderFront.castShadow = true
        zamboniGroup.add(fenderFront)

        const fenderRear = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.26, 0.72),
          zBlue,
        )
        fenderRear.position.set(side * laneW * 0.28, 0.62, 0.92)
        fenderRear.castShadow = true
        zamboniGroup.add(fenderRear)
      }

      const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 18)
      const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.24, 12)
      for (const [wx, wz] of [[-laneW * 0.28, -0.86], [laneW * 0.28, -0.86], [-laneW * 0.28, 0.92], [laneW * 0.28, 0.92]]) {
        const wheel = new THREE.Mesh(wheelGeo, zRubber)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(wx, 0.3, wz)
        wheel.castShadow = true
        zamboniGroup.add(wheel)

        const hub = new THREE.Mesh(hubGeo, zMetal)
        hub.rotation.z = Math.PI / 2
        hub.position.set(wx, 0.3, wz)
        zamboniGroup.add(hub)
      }

      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.7, 0.12, 0.22),
        zMetal,
      )
      bumper.position.set(0, 0.22, -1.5)
      bumper.castShadow = true
      zamboniGroup.add(bumper)

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.76, 0.08, 0.34),
        zDark,
      )
      blade.position.set(0, 0.08, -1.68)
      blade.castShadow = true
      zamboniGroup.add(blade)

      const conditioner = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.56, 0.34, 0.56),
        zMetal,
      )
      conditioner.position.set(0, 0.28, 1.52)
      conditioner.castShadow = true
      zamboniGroup.add(conditioner)

      const squeegee = new THREE.Mesh(
        new THREE.BoxGeometry(laneW * 0.64, 0.06, 0.18),
        zDark,
      )
      squeegee.position.set(0, 0.06, 1.86)
      zamboniGroup.add(squeegee)

      for (const side of [-1, 1]) {
        const headlight = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 10, 8),
          zLight,
        )
        headlight.position.set(side * laneW * 0.2, 0.84, -1.55)
        zamboniGroup.add(headlight)
      }

      const beaconBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10),
        zDark,
      )
      beaconBase.position.set(0, 2.28, 0.12)
      zamboniGroup.add(beaconBase)

      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10),
        zBeacon,
      )
      beacon.position.set(0, 2.38, 0.12)
      zamboniGroup.add(beacon)

      zamboniGroup.visible = false
      group.add(zamboniGroup)
      meshes.set('zamboni', zamboniGroup)

      // --- CRACK: dark jagged line on ice ---
      const crackGroup = new THREE.Group()
      const crackBase = new THREE.Mesh(
        new THREE.PlaneGeometry(laneW, 2.5),
        new THREE.MeshStandardMaterial({
          color: 0x1a1a2e,
          transparent: true,
          opacity: 0.7,
          roughness: 0.9,
        }),
      )
      crackBase.rotation.x = -Math.PI / 2
      crackBase.position.y = 0.02
      crackGroup.add(crackBase)
      // Jagged crack lines
      for (let j = 0; j < 5; j++) {
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.15, 0.05, 0.8 + Math.random() * 0.5),
          new THREE.MeshBasicMaterial({ color: 0x4a90d9 }),
        )
        seg.position.set((Math.random() - 0.5) * laneW * 0.6, 0.03, (Math.random() - 0.5) * 1.5)
        seg.rotation.y = (Math.random() - 0.5) * 0.8
        crackGroup.add(seg)
      }
      crackGroup.visible = false
      group.add(crackGroup)
      meshes.set('crack', crackGroup)

      // --- SNOW: mound of snow/shavings ---
      const snowGroup = new THREE.Group()
      const snowMound = new THREE.Mesh(
        new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xf0f5ff, roughness: 0.95, metalness: 0 }),
      )
      snowMound.scale.set(laneW / 3, 1, 1.2)
      snowMound.castShadow = true
      snowGroup.add(snowMound)
      // Smaller mounds
      for (let s = 0; s < 3; s++) {
        const sm = new THREE.Mesh(
          new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: 0xe8eeff, roughness: 0.95 }),
        )
        sm.position.set((Math.random() - 0.5) * laneW * 0.5, 0, (Math.random() - 0.5) * 0.8)
        snowGroup.add(sm)
      }
      snowGroup.visible = false
      group.add(snowGroup)
      meshes.set('snow', snowGroup)

      // --- GATE: penalty box gate (orange/yellow striped barrier) ---
      const gateGroup = new THREE.Group()
      const gatePole1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.5 }),
      )
      gatePole1.position.set(-laneW * 0.45, 1.25, 0)
      gatePole1.castShadow = true
      gateGroup.add(gatePole1)
      const gatePole2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0xf39c12, roughness: 0.5 }),
      )
      gatePole2.position.set(laneW * 0.45, 1.25, 0)
      gatePole2.castShadow = true
      gateGroup.add(gatePole2)
      // Crossbar
      const crossbar = new THREE.Mesh(
        new THREE.BoxGeometry(laneW, 0.15, 0.15),
        new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.4 }),
      )
      crossbar.position.y = 2.3
      gateGroup.add(crossbar)
      // Horizontal bars (danger stripes)
      for (let b = 0; b < 3; b++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(laneW, 0.1, 0.1),
          new THREE.MeshStandardMaterial({ color: b % 2 === 0 ? 0xe74c3c : 0xf39c12 }),
        )
        bar.position.y = 0.6 + b * 0.7
        gateGroup.add(bar)
      }
      gateGroup.visible = false
      group.add(gateGroup)
      meshes.set('gate', gateGroup)

      this.scene.add(group)
      this.obstaclePool.push(group)
      this.obstacleTypeMeshes.push(meshes)

      // Second lane group (clone of gate for the second lane)
      const secondGroup = new THREE.Group()
      secondGroup.visible = false
      // Simple barrier for second lane
      const sg = new THREE.Group()
      const sp1 = gatePole1.clone()
      const sp2 = gatePole2.clone()
      const scb = crossbar.clone()
      sg.add(sp1, sp2, scb)
      for (let b = 0; b < 3; b++) {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(laneW, 0.1, 0.1),
          new THREE.MeshStandardMaterial({ color: b % 2 === 0 ? 0xe74c3c : 0xf39c12 }),
        )
        bar.position.y = 0.6 + b * 0.7
        sg.add(bar)
      }
      secondGroup.add(sg)
      this.scene.add(secondGroup)
      this.secondLanePool.push(secondGroup)
    }
  }

  private loadObstacleAsset(type: string, path: string, targetWidth: number): void {
    const loader = new GLTFLoader()
    loader.load(
      path,
      (gltf) => {
        this.installObstacleAsset(type, gltf.scene, targetWidth)
      },
      undefined,
      (error) => {
        console.warn(`[Renderer] Falling back to procedural ${type}:`, error)
      },
    )
  }

  private installObstacleAsset(type: string, template: THREE.Object3D, targetWidth: number): void {
    const normalized = template.clone(true)
    const bounds = new THREE.Box3().setFromObject(normalized)
    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    bounds.getSize(size)
    bounds.getCenter(center)

    const scale = size.x > 0 ? targetWidth / size.x : 1
    normalized.scale.setScalar(scale)
    normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)

    normalized.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const isOpaque = materials.every((material) => !material.transparent && material.opacity >= 1)
        mesh.castShadow = isOpaque
        mesh.receiveShadow = false
      }
    })

    for (let i = 0; i < this.obstacleTypeMeshes.length; i++) {
      const obstacleGroup = this.obstacleTypeMeshes[i].get(type)
      if (!(obstacleGroup instanceof THREE.Group)) continue
      obstacleGroup.clear()
      obstacleGroup.add(normalized.clone(true))
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
    const iceMat = this.icePlane.material as THREE.MeshStandardMaterial
    if (iceMat.map) {
      iceMat.map.offset.y = this.scrollOffset
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

    // Render
    this.renderer.render(this.scene, this.camera)
  }

  // -----------------------------------------------------------------------
  // Avatar update
  // -----------------------------------------------------------------------

  private updateAvatar(state: GameState, dt: number): void {
    const showAvatar = state.screen === 'playing' || state.screen === 'countdown' || state.screen === 'paused' || state.screen === 'tutorial'
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
    const color = invincible ? COLORS.avatarDeke : COLORS.avatarNormal
    bodyMat.color.setHex(color)
    bodyMat.emissive.setHex(color)
    bodyMat.emissiveIntensity = 0.6 + Math.sin(performance.now() * 0.004) * 0.2

    // Ring spin
    this.avatarHead.rotation.z = performance.now() * 0.002
    const ringMat = this.avatarHead.material as THREE.MeshBasicMaterial
    ringMat.color.setHex(color)

    // Outer glow — always visible, pulses, bigger when invincible
    const glowMat = this.avatarGlow.material as THREE.MeshBasicMaterial
    glowMat.color.setHex(color)
    const baseOpacity = invincible ? 0.25 : 0.12
    glowMat.opacity = baseOpacity + Math.sin(performance.now() * 0.006) * 0.06
    const glowScale = invincible ? 1.4 + Math.sin(performance.now() * 0.01) * 0.2 : 1.0
    this.avatarGlow.scale.setScalar(glowScale)
  }

  // -----------------------------------------------------------------------
  // Obstacles update
  // -----------------------------------------------------------------------

  private updateObstacles(state: GameState): void {
    const obstacles = state.obstacles

    for (let i = 0; i < MAX_OBSTACLES; i++) {
      const group = this.obstaclePool[i]
      const meshes = this.obstacleTypeMeshes[i]
      const secondGroup = this.secondLanePool[i]

      if (i >= obstacles.length) {
        group.visible = false
        secondGroup.visible = false
        continue
      }

      const obs = obstacles[i]
      if (!obs.active) {
        group.visible = false
        secondGroup.visible = false
        continue
      }

      group.visible = true

      // Map y (0=far, 1=near) to world z
      const worldZ = FAR_Z + obs.y * (NEAR_Z - FAR_Z)
      // Moving obstacles use continuous X position; static use lane center
      const worldX = obs.moving
        ? (obs.movingX - 0.5) * RINK_W
        : (LANE_X[obs.lane] ?? 0)
      group.position.set(worldX, 0, worldZ)

      // Show only the mesh matching the obstacle type
      for (const [type, mesh] of meshes) {
        mesh.visible = type === obs.type
      }

      // Second lane (gate only)
      if (obs.secondLane) {
        const x2 = LANE_X[obs.secondLane] ?? 0
        secondGroup.visible = true
        secondGroup.position.set(x2, 0, worldZ)
      } else {
        secondGroup.visible = false
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
