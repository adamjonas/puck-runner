import * as THREE from 'three'
import type { GameState } from './game-state'

interface AvatarViewOptions {
  scene: THREE.Scene
  rinkWidth: number
  avatarZ: number
  normalColor: number
  dekeColor: number
}

export class AvatarView {
  private readonly group = new THREE.Group()
  private readonly body: THREE.Mesh
  private readonly ring: THREE.Mesh
  private readonly glow: THREE.Mesh

  private readonly rinkWidth: number
  private readonly avatarZ: number
  private readonly normalColor: number
  private readonly dekeColor: number

  private prevAvatarX = 0.5
  private leanAngle = 0

  constructor(options: AvatarViewOptions) {
    this.rinkWidth = options.rinkWidth
    this.avatarZ = options.avatarZ
    this.normalColor = options.normalColor
    this.dekeColor = options.dekeColor

    const coreGeo = new THREE.SphereGeometry(0.8, 24, 18)
    const coreMat = new THREE.MeshStandardMaterial({
      color: this.normalColor,
      emissive: this.normalColor,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.3,
    })
    this.body = new THREE.Mesh(coreGeo, coreMat)
    this.body.position.y = 1.0
    this.body.castShadow = true
    this.group.add(this.body)

    const ringGeo = new THREE.TorusGeometry(1.0, 0.08, 8, 32)
    const ringMat = new THREE.MeshBasicMaterial({
      color: this.normalColor,
      transparent: true,
      opacity: 0.5,
    })
    this.ring = new THREE.Mesh(ringGeo, ringMat)
    this.ring.position.y = 1.0
    this.ring.rotation.x = Math.PI / 2
    this.group.add(this.ring)

    const glowGeo = new THREE.SphereGeometry(1.8, 16, 12)
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.normalColor,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    })
    this.glow = new THREE.Mesh(glowGeo, glowMat)
    this.glow.position.y = 1.0
    this.group.add(this.glow)

    const avatarLight = new THREE.PointLight(this.normalColor, 1.5, 12)
    avatarLight.position.y = 1.0
    this.group.add(avatarLight)

    this.group.position.set(0, 0, this.avatarZ)
    options.scene.add(this.group)
  }

  update(
    state: GameState,
    dt: number,
    now: number,
    onIceSpray: (x: number, z: number, direction: number) => void,
  ): void {
    const showAvatar = (
      state.screen === 'playing' ||
      state.screen === 'countdown' ||
      state.screen === 'paused' ||
      state.screen === 'tutorial'
    )
    this.group.visible = showAvatar
    if (!showAvatar) return

    const worldX = (state.avatarX - 0.5) * this.rinkWidth
    this.group.position.x = worldX

    const dx = state.avatarX - this.prevAvatarX
    const targetLean = -dx * 40
    this.leanAngle += (targetLean - this.leanAngle) * Math.min(1, dt * 0.01)
    this.group.rotation.z = THREE.MathUtils.clamp(this.leanAngle, -0.35, 0.35)

    if (Math.abs(dx) > 0.005) {
      const direction = dx > 0 ? -1 : 1
      if (Math.random() < 0.15) {
        onIceSpray(worldX, this.avatarZ, direction)
      }
    }
    this.prevAvatarX = state.avatarX

    const bodyMat = this.body.material as THREE.MeshStandardMaterial
    const color = state.isDekeInvincible ? this.dekeColor : this.normalColor
    bodyMat.color.setHex(color)
    bodyMat.emissive.setHex(color)
    bodyMat.emissiveIntensity = 0.6 + Math.sin(now * 0.004) * 0.2

    this.ring.rotation.z = now * 0.002
    const ringMat = this.ring.material as THREE.MeshBasicMaterial
    ringMat.color.setHex(color)

    const glowMat = this.glow.material as THREE.MeshBasicMaterial
    glowMat.color.setHex(color)
    const baseOpacity = state.isDekeInvincible ? 0.25 : 0.12
    glowMat.opacity = baseOpacity + Math.sin(now * 0.006) * 0.06
    const glowScale = state.isDekeInvincible
      ? 1.4 + Math.sin(now * 0.01) * 0.2
      : 1.0
    this.glow.scale.setScalar(glowScale)
  }
}
