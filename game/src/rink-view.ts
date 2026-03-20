import * as THREE from 'three'

interface RinkViewOptions {
  scene: THREE.Scene
  rinkWidth: number
  rinkLength: number
  boardHeight: number
  boardThickness: number
  farZ: number
  nearZ: number
  laneX: Record<string, number>
  boardColor: number
  laneLineColor: number
}

export class RinkView {
  private readonly icePlane: THREE.Mesh

  constructor(options: RinkViewOptions) {
    this.icePlane = this.buildIce(options)
    options.scene.add(this.icePlane)
    options.scene.add(this.buildLaneDividers(options))
    options.scene.add(this.buildBoards(options))
  }

  updateScroll(offset: number): void {
    const material = this.icePlane.material as THREE.MeshStandardMaterial
    if (!material.map) return
    material.map.offset.y = offset
    material.map.needsUpdate = true
  }

  private buildIce(options: RinkViewOptions): THREE.Mesh {
    const texCanvas = document.createElement('canvas')
    texCanvas.width = 512
    texCanvas.height = 2048
    const ctx = texCanvas.getContext('2d')!

    ctx.fillStyle = '#E8F4F8'
    ctx.fillRect(0, 0, 512, 2048)

    ctx.fillStyle = 'rgba(200, 50, 50, 0.35)'
    ctx.fillRect(0, 1024 - 6, 512, 12)

    ctx.fillStyle = 'rgba(50, 100, 170, 0.3)'
    ctx.fillRect(0, 680 - 4, 512, 8)
    ctx.fillRect(0, 1368 - 4, 512, 8)

    ctx.strokeStyle = 'rgba(200, 50, 50, 0.2)'
    ctx.lineWidth = 3
    for (const cy of [680, 1368]) {
      for (const cx of [150, 362]) {
        ctx.beginPath()
        ctx.arc(cx, cy, 60, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.strokeStyle = 'rgba(50, 100, 170, 0.25)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(256, 1024, 70, 0, Math.PI * 2)
    ctx.stroke()

    const texture = new THREE.CanvasTexture(texCanvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(1, 2)

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(options.rinkWidth, options.rinkLength * 2),
      new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.15,
        metalness: 0.05,
      }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.receiveShadow = true
    return mesh
  }

  private buildLaneDividers(options: RinkViewOptions): THREE.Group {
    const group = new THREE.Group()
    const material = new THREE.MeshBasicMaterial({
      color: options.laneLineColor,
      transparent: true,
      opacity: 0.25,
    })
    const geometry = new THREE.PlaneGeometry(0.08, 1.5)

    for (const xPos of [
      (options.laneX.left + options.laneX.center) / 2,
      (options.laneX.center + options.laneX.right) / 2,
    ]) {
      for (let z = options.farZ; z < options.nearZ; z += 3) {
        const dash = new THREE.Mesh(geometry, material)
        dash.rotation.x = -Math.PI / 2
        dash.position.set(xPos, 0.01, z)
        group.add(dash)
      }
    }

    return group
  }

  private buildBoards(options: RinkViewOptions): THREE.Group {
    const group = new THREE.Group()
    const geometry = new THREE.BoxGeometry(
      options.boardThickness,
      options.boardHeight,
      options.rinkLength * 2,
    )
    const material = new THREE.MeshStandardMaterial({
      color: options.boardColor,
      roughness: 0.7,
      metalness: 0.1,
    })

    const leftBoard = new THREE.Mesh(geometry, material)
    leftBoard.position.set(
      -options.rinkWidth / 2 - options.boardThickness / 2,
      options.boardHeight / 2,
      0,
    )
    leftBoard.castShadow = true
    group.add(leftBoard)

    const rightBoard = new THREE.Mesh(geometry, material)
    rightBoard.position.set(
      options.rinkWidth / 2 + options.boardThickness / 2,
      options.boardHeight / 2,
      0,
    )
    rightBoard.castShadow = true
    group.add(rightBoard)

    return group
  }
}
