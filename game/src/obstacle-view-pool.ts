import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { Obstacle } from './game-state'

type ObstacleType = Obstacle['type']

interface ObstacleViewPoolOptions {
  scene: THREE.Scene
  rinkWidth: number
  farZ: number
  nearZ: number
  laneX: Record<string, number>
  maxObstacles: number
}

export class ObstacleViewPool {
  private readonly scene: THREE.Scene
  private readonly rinkWidth: number
  private readonly farZ: number
  private readonly nearZ: number
  private readonly laneX: Record<string, number>
  private readonly maxObstacles: number

  private readonly obstaclePool: THREE.Group[] = []
  private readonly obstacleTypeMeshes: Map<ObstacleType, THREE.Object3D>[] = []
  private readonly secondLanePool: THREE.Group[] = []

  constructor(options: ObstacleViewPoolOptions) {
    this.scene = options.scene
    this.rinkWidth = options.rinkWidth
    this.farZ = options.farZ
    this.nearZ = options.nearZ
    this.laneX = options.laneX
    this.maxObstacles = options.maxObstacles

    this.buildPool()
  }

  loadAsset(type: ObstacleType, path: string, targetWidth: number): void {
    const loader = new GLTFLoader()
    loader.load(
      path,
      (gltf) => {
        this.installAsset(type, gltf.scene, targetWidth)
      },
      undefined,
      (error) => {
        console.warn(`[Renderer] Falling back to procedural ${type}:`, error)
      },
    )
  }

  update(obstacles: Obstacle[]): void {
    for (let i = 0; i < this.maxObstacles; i++) {
      const group = this.obstaclePool[i]
      const meshes = this.obstacleTypeMeshes[i]
      const secondGroup = this.secondLanePool[i]

      if (i >= obstacles.length) {
        group.visible = false
        secondGroup.visible = false
        continue
      }

      const obstacle = obstacles[i]
      if (!obstacle.active) {
        group.visible = false
        secondGroup.visible = false
        continue
      }

      group.visible = true

      const worldZ = this.farZ + obstacle.y * (this.nearZ - this.farZ)
      const worldX = obstacle.moving
        ? (obstacle.movingX - 0.5) * this.rinkWidth
        : (this.laneX[obstacle.lane] ?? 0)
      group.position.set(worldX, 0, worldZ)

      for (const [type, mesh] of meshes) {
        mesh.visible = type === obstacle.type
      }

      if (obstacle.secondLane) {
        const x2 = this.laneX[obstacle.secondLane] ?? 0
        secondGroup.visible = true
        secondGroup.position.set(x2, 0, worldZ)
      } else {
        secondGroup.visible = false
      }
    }
  }

  private buildPool(): void {
    const laneW = this.rinkWidth * 0.28

    for (let i = 0; i < this.maxObstacles; i++) {
      const group = new THREE.Group()
      group.visible = false
      const meshes = new Map<ObstacleType, THREE.Object3D>()

      const boardsGroup = createBoardsObstacleGroup(laneW)
      boardsGroup.visible = false
      group.add(boardsGroup)
      meshes.set('boards', boardsGroup)

      const zamboniGroup = createZamboniObstacleGroup(laneW)
      zamboniGroup.visible = false
      group.add(zamboniGroup)
      meshes.set('zamboni', zamboniGroup)

      const crackGroup = createCrackObstacleGroup(laneW)
      crackGroup.visible = false
      group.add(crackGroup)
      meshes.set('crack', crackGroup)

      const snowGroup = createSnowObstacleGroup(laneW)
      snowGroup.visible = false
      group.add(snowGroup)
      meshes.set('snow', snowGroup)

      const gateGroup = createGateObstacleGroup(laneW)
      gateGroup.visible = false
      group.add(gateGroup)
      meshes.set('gate', gateGroup)

      this.scene.add(group)
      this.obstaclePool.push(group)
      this.obstacleTypeMeshes.push(meshes)

      const secondGroup = new THREE.Group()
      secondGroup.visible = false
      secondGroup.add(createSecondLaneGateGroup(laneW))
      this.scene.add(secondGroup)
      this.secondLanePool.push(secondGroup)
    }
  }

  private installAsset(type: ObstacleType, template: THREE.Object3D, targetWidth: number): void {
    const normalized = normalizeAssetTemplate(template, targetWidth)

    normalized.traverse((node) => {
      if (!(node as THREE.Mesh).isMesh) return
      const mesh = node as THREE.Mesh
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      const isOpaque = materials.every((material) => !material.transparent && material.opacity >= 1)
      mesh.castShadow = isOpaque
      mesh.receiveShadow = false
    })

    for (let i = 0; i < this.obstacleTypeMeshes.length; i++) {
      const obstacleGroup = this.obstacleTypeMeshes[i].get(type)
      if (!(obstacleGroup instanceof THREE.Group)) continue
      obstacleGroup.clear()
      obstacleGroup.add(normalized.clone(true))
    }
  }
}

function normalizeAssetTemplate(template: THREE.Object3D, targetWidth: number): THREE.Object3D {
  const normalized = template.clone(true)
  const bounds = new THREE.Box3().setFromObject(normalized)
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  bounds.getSize(size)
  bounds.getCenter(center)

  const scale = size.x > 0 ? targetWidth / size.x : 1
  normalized.scale.setScalar(scale)
  normalized.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale)

  return normalized
}

function createBoardsObstacleGroup(laneW: number): THREE.Group {
  const boardsGroup = new THREE.Group()
  const boardMain = new THREE.Mesh(
    new THREE.BoxGeometry(laneW, 1.8, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.8, metalness: 0 }),
  )
  boardMain.position.y = 0.9
  boardMain.castShadow = true
  boardsGroup.add(boardMain)

  for (let p = 0; p < 3; p++) {
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(laneW + 0.2, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.9 }),
    )
    plank.position.y = 0.4 + p * 0.6
    boardsGroup.add(plank)
  }

  return boardsGroup
}

function createZamboniObstacleGroup(laneW: number): THREE.Group {
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

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.82, 0.38, 3.05), zBlue)
  chassis.position.y = 0.34
  chassis.castShadow = true
  zamboniGroup.add(chassis)

  const body = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.72, 1.15, 2.2), zWhite)
  body.position.set(0, 0.98, 0.18)
  body.castShadow = true
  zamboniGroup.add(body)

  const frontCowling = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.64, 0.72, 0.92), zWhite)
  frontCowling.position.set(0, 0.86, -1.12)
  frontCowling.rotation.x = 0.08
  frontCowling.castShadow = true
  zamboniGroup.add(frontCowling)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.58, 0.14, 1.4), zDark)
  roof.position.set(0, 2.18, -0.28)
  roof.castShadow = true
  zamboniGroup.add(roof)

  const cabBack = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.5, 0.8, 1.02), zWhite)
  cabBack.position.set(0, 1.78, -0.25)
  cabBack.castShadow = true
  zamboniGroup.add(cabBack)

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(laneW * 0.46, 0.62), zGlass)
  windshield.position.set(0, 1.86, -0.82)
  windshield.rotation.x = -0.22
  zamboniGroup.add(windshield)

  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.48), zGlass)
    sideWindow.position.set(side * laneW * 0.26, 1.82, -0.22)
    sideWindow.rotation.y = side * Math.PI / 2
    zamboniGroup.add(sideWindow)

    const sideStripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 2.08), zBlue)
    sideStripe.position.set(side * laneW * 0.37, 0.86, 0.12)
    sideStripe.castShadow = true
    zamboniGroup.add(sideStripe)

    const fenderFront = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.72), zBlue)
    fenderFront.position.set(side * laneW * 0.28, 0.62, -0.86)
    fenderFront.castShadow = true
    zamboniGroup.add(fenderFront)

    const fenderRear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.72), zBlue)
    fenderRear.position.set(side * laneW * 0.28, 0.62, 0.92)
    fenderRear.castShadow = true
    zamboniGroup.add(fenderRear)
  }

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 18)
  const hubGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.24, 12)
  for (const [wx, wz] of [[-laneW * 0.28, -0.86], [laneW * 0.28, -0.86], [-laneW * 0.28, 0.92], [laneW * 0.28, 0.92]] as const) {
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

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.7, 0.12, 0.22), zMetal)
  bumper.position.set(0, 0.22, -1.5)
  bumper.castShadow = true
  zamboniGroup.add(bumper)

  const blade = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.76, 0.08, 0.34), zDark)
  blade.position.set(0, 0.08, -1.68)
  blade.castShadow = true
  zamboniGroup.add(blade)

  const conditioner = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.56, 0.34, 0.56), zMetal)
  conditioner.position.set(0, 0.28, 1.52)
  conditioner.castShadow = true
  zamboniGroup.add(conditioner)

  const squeegee = new THREE.Mesh(new THREE.BoxGeometry(laneW * 0.64, 0.06, 0.18), zDark)
  squeegee.position.set(0, 0.06, 1.86)
  zamboniGroup.add(squeegee)

  for (const side of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), zLight)
    headlight.position.set(side * laneW * 0.2, 0.84, -1.55)
    zamboniGroup.add(headlight)
  }

  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), zDark)
  beaconBase.position.set(0, 2.28, 0.12)
  zamboniGroup.add(beaconBase)

  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10), zBeacon)
  beacon.position.set(0, 2.38, 0.12)
  zamboniGroup.add(beacon)

  return zamboniGroup
}

function createCrackObstacleGroup(laneW: number): THREE.Group {
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

  for (let i = 0; i < 5; i++) {
    const segment = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.05, 0.8 + Math.random() * 0.5),
      new THREE.MeshBasicMaterial({ color: 0x4a90d9 }),
    )
    segment.position.set((Math.random() - 0.5) * laneW * 0.6, 0.03, (Math.random() - 0.5) * 1.5)
    segment.rotation.y = (Math.random() - 0.5) * 0.8
    crackGroup.add(segment)
  }

  return crackGroup
}

function createSnowObstacleGroup(laneW: number): THREE.Group {
  const snowGroup = new THREE.Group()
  const snowMound = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf0f5ff, roughness: 0.95, metalness: 0 }),
  )
  snowMound.scale.set(laneW / 3, 1, 1.2)
  snowMound.castShadow = true
  snowGroup.add(snowMound)

  for (let i = 0; i < 3; i++) {
    const mound = new THREE.Mesh(
      new THREE.SphereGeometry(0.5 + Math.random() * 0.4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe8eeff, roughness: 0.95 }),
    )
    mound.position.set((Math.random() - 0.5) * laneW * 0.5, 0, (Math.random() - 0.5) * 0.8)
    snowGroup.add(mound)
  }

  return snowGroup
}

function createGateObstacleGroup(laneW: number): THREE.Group {
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

  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(laneW, 0.15, 0.15),
    new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.4 }),
  )
  crossbar.position.y = 2.3
  gateGroup.add(crossbar)

  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(laneW, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0xe74c3c : 0xf39c12 }),
    )
    bar.position.y = 0.6 + i * 0.7
    gateGroup.add(bar)
  }

  return gateGroup
}

function createSecondLaneGateGroup(laneW: number): THREE.Group {
  const source = createGateObstacleGroup(laneW)
  const secondLaneGroup = new THREE.Group()
  secondLaneGroup.add(...source.children.map((child) => child.clone()))
  return secondLaneGroup
}
