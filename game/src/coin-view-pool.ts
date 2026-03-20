import * as THREE from 'three'
import type { Coin } from './game-state'

interface CoinViewPoolOptions {
  scene: THREE.Scene
  laneX: Record<string, number>
  farZ: number
  nearZ: number
  maxCoins: number
  coinColor: number
}

export class CoinViewPool {
  private readonly scene: THREE.Scene
  private readonly laneX: Record<string, number>
  private readonly farZ: number
  private readonly nearZ: number
  private readonly maxCoins: number
  private readonly coinColor: number

  private readonly coinPool: THREE.Mesh[] = []
  private readonly coinGlowPool: THREE.Mesh[] = []

  constructor(options: CoinViewPoolOptions) {
    this.scene = options.scene
    this.laneX = options.laneX
    this.farZ = options.farZ
    this.nearZ = options.nearZ
    this.maxCoins = options.maxCoins
    this.coinColor = options.coinColor

    this.buildPool()
  }

  update(
    coins: Coin[],
    time: number,
    onCollectedBurst: (x: number, y: number, z: number) => void,
  ): void {
    for (let i = 0; i < this.maxCoins; i++) {
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
        const scale = mesh.scale.x
        if (scale > 0.01) {
          const newScale = scale * 0.85
          mesh.scale.setScalar(newScale)
          glow.scale.setScalar(newScale)
          if (scale > 0.9) {
            const worldX = this.laneX[coin.lane] ?? 0
            const worldZ = this.farZ + coin.y * (this.nearZ - this.farZ)
            onCollectedBurst(worldX, 1.0, worldZ)
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
      glow.scale.setScalar(1)

      const worldX = this.laneX[coin.lane] ?? 0
      const worldZ = this.farZ + coin.y * (this.nearZ - this.farZ)
      const floatY = 1.0 + Math.sin(time * 0.003 + i) * 0.2

      mesh.position.set(worldX, floatY, worldZ)
      mesh.rotation.x = Math.PI / 2
      mesh.rotation.z = time * 0.002 + i

      glow.position.set(worldX, floatY, worldZ)
    }
  }

  private buildPool(): void {
    for (let i = 0; i < this.maxCoins; i++) {
      const geo = new THREE.TorusGeometry(0.5, 0.15, 8, 24)
      const mat = new THREE.MeshStandardMaterial({
        color: this.coinColor,
        emissive: this.coinColor,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.7,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      mesh.castShadow = true
      this.scene.add(mesh)
      this.coinPool.push(mesh)

      const glowGeo = new THREE.SphereGeometry(0.9, 8, 6)
      const glowMat = new THREE.MeshBasicMaterial({
        color: this.coinColor,
        transparent: true,
        opacity: 0.15,
      })
      const glow = new THREE.Mesh(glowGeo, glowMat)
      glow.visible = false
      this.scene.add(glow)
      this.coinGlowPool.push(glow)
    }
  }
}
