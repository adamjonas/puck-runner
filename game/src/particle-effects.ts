import * as THREE from 'three'

interface Particle {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
  active: boolean
}

interface ParticleEffectsOptions {
  scene: THREE.Scene
  coinColor: number
}

export class ParticleEffects {
  private readonly iceParticles: Particle[] = []
  private readonly coinParticles: Particle[] = []

  constructor(options: ParticleEffectsOptions) {
    this.buildIceParticlePool(options.scene)
    this.buildCoinParticlePool(options.scene, options.coinColor)
  }

  emitIceSpray(x: number, z: number, direction: number): void {
    let count = 0
    for (const particle of this.iceParticles) {
      if (!particle.active && count < 12) {
        particle.active = true
        particle.mesh.visible = true
        particle.mesh.position.set(x, 0.1, z)
        particle.velocity.set(
          direction * (2 + Math.random() * 3),
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 2,
        )
        particle.life = 0
        particle.maxLife = 300 + Math.random() * 200
        count++
      }
    }
  }

  emitCoinBurst(x: number, y: number, z: number): void {
    let count = 0
    for (const particle of this.coinParticles) {
      if (!particle.active && count < 8) {
        particle.active = true
        particle.mesh.visible = true
        particle.mesh.position.set(x, y, z)
        particle.velocity.set(
          (Math.random() - 0.5) * 3,
          3 + Math.random() * 3,
          (Math.random() - 0.5) * 3,
        )
        particle.life = 0
        particle.maxLife = 400 + Math.random() * 300
        count++
      }
    }
  }

  update(dt: number): void {
    const dtSec = dt / 1000
    const gravity = -15

    const updateList = (particles: Particle[]) => {
      for (const particle of particles) {
        if (!particle.active) continue
        particle.life += dt
        if (particle.life >= particle.maxLife) {
          particle.active = false
          particle.mesh.visible = false
          continue
        }

        particle.velocity.y += gravity * dtSec
        particle.mesh.position.x += particle.velocity.x * dtSec
        particle.mesh.position.y += particle.velocity.y * dtSec
        particle.mesh.position.z += particle.velocity.z * dtSec
        if (particle.mesh.position.y < 0) {
          particle.active = false
          particle.mesh.visible = false
        }

        const t = particle.life / particle.maxLife
        const scale = 1 - t * t
        particle.mesh.scale.setScalar(scale)
      }
    }

    updateList(this.iceParticles)
    updateList(this.coinParticles)
  }

  private buildIceParticlePool(scene: THREE.Scene): void {
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08)
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff })
    for (let i = 0; i < 60; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      scene.add(mesh)
      this.iceParticles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      })
    }
  }

  private buildCoinParticlePool(scene: THREE.Scene, coinColor: number): void {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const mat = new THREE.MeshBasicMaterial({ color: coinColor })
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.visible = false
      scene.add(mesh)
      this.coinParticles.push({
        mesh,
        velocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
        active: false,
      })
    }
  }
}
