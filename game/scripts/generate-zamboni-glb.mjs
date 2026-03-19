import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.resolve(SCRIPT_DIR, '../public/models/zamboni-original.glb')

globalThis.FileReader = class FileReaderPolyfill {
  constructor() {
    this.result = null
    this.error = null
    this.onloadend = null
    this.onerror = null
  }

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
      .catch((error) => {
        this.error = error
        this.onerror?.(error)
      })
  }

  readAsDataURL(blob) {
    blob.arrayBuffer()
      .then((buffer) => {
        const base64 = Buffer.from(buffer).toString('base64')
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`
        this.onloadend?.()
      })
      .catch((error) => {
        this.error = error
        this.onerror?.(error)
      })
  }
}

function applyShadowSettings(root) {
  root.traverse((node) => {
    if (node.isMesh) {
      node.castShadow = true
      node.receiveShadow = false
    }
  })
}

function add(root, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  root.add(mesh)
  return mesh
}

function buildZamboni() {
  const group = new THREE.Group()
  group.name = 'OriginalLowPolyZamboni'

  const white = new THREE.MeshStandardMaterial({ color: 0xf5f7fb, roughness: 0.38, metalness: 0.16 })
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.48, metalness: 0.14 })
  const navy = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.08 })
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8b7c9, roughness: 0.32, metalness: 0.72 })
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.5 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.95, metalness: 0.02 })
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff,
    transparent: true,
    opacity: 0.45,
    roughness: 0.08,
    metalness: 0.04,
  })
  const warmLight = new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffd166, emissiveIntensity: 1.0 })
  const amber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.9 })
  const black = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.85, metalness: 0.05 })

  add(group, new THREE.BoxGeometry(5.3, 0.34, 6.2), blue, [0, 0.34, 0])
  add(group, new THREE.BoxGeometry(4.7, 1.1, 4.0), white, [0, 1.02, -0.2])
  add(group, new THREE.BoxGeometry(4.9, 0.24, 3.0), blue, [0, 0.72, -0.15])
  add(group, new THREE.BoxGeometry(4.15, 0.9, 1.4), white, [0, 1.05, 2.0], [-0.1, 0, 0])
  add(group, new THREE.BoxGeometry(4.3, 0.1, 1.55), black, [0, 0.18, 2.95])
  add(group, new THREE.BoxGeometry(3.35, 0.75, 2.15), white, [0, 1.82, 0.15])
  add(group, new THREE.BoxGeometry(3.55, 0.12, 2.45), navy, [0, 2.28, 0.05])
  add(group, new THREE.PlaneGeometry(3.05, 0.64), glass, [0, 1.9, 1.12], [0.0, Math.PI, 0.22])
  add(group, new THREE.PlaneGeometry(1.85, 0.55), glass, [-1.72, 1.9, 0.2], [0, -Math.PI / 2, 0])
  add(group, new THREE.PlaneGeometry(1.85, 0.55), glass, [1.72, 1.9, 0.2], [0, Math.PI / 2, 0])

  for (const side of [-1, 1]) {
    add(group, new THREE.BoxGeometry(0.12, 0.22, 4.05), blue, [side * 2.38, 1.05, -0.2])
    add(group, new THREE.BoxGeometry(0.55, 0.3, 1.25), blue, [side * 1.95, 0.64, 1.55])
    add(group, new THREE.BoxGeometry(0.55, 0.3, 1.25), blue, [side * 1.95, 0.64, -1.55])
  }

  const wheelGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.38, 18)
  const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.42, 12)
  for (const [x, z] of [
    [-1.95, 1.55],
    [1.95, 1.55],
    [-1.95, -1.55],
    [1.95, -1.55],
  ]) {
    add(group, wheelGeo, rubber, [x, 0.52, z], [0, 0, Math.PI / 2])
    add(group, hubGeo, darkMetal, [x, 0.52, z], [0, 0, Math.PI / 2])
  }

  add(group, new THREE.BoxGeometry(4.55, 0.1, 0.36), metal, [0, 0.14, 3.18])
  add(group, new THREE.BoxGeometry(3.85, 0.14, 0.5), darkMetal, [0, 0.2, 2.48])
  add(group, new THREE.BoxGeometry(3.4, 0.42, 0.95), metal, [0, 0.38, -3.0])
  add(group, new THREE.BoxGeometry(4.2, 0.08, 0.22), black, [0, 0.1, -3.48])

  for (const side of [-1, 1]) {
    add(group, new THREE.SphereGeometry(0.16, 10, 8), warmLight, [side * 1.35, 0.98, 3.04])
    add(group, new THREE.SphereGeometry(0.12, 10, 8), warmLight, [side * 0.62, 0.96, 3.08])
  }

  add(group, new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), navy, [0, 2.45, -0.1])
  add(group, new THREE.CylinderGeometry(0.12, 0.12, 0.16, 10), amber, [0, 2.58, -0.1])

  const seat = add(group, new THREE.BoxGeometry(1.0, 0.14, 0.9), black, [0, 1.35, 0.1])
  seat.visible = false

  applyShadowSettings(group)
  return group
}

async function exportBinary(root) {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      root,
      (result) => resolve(Buffer.from(result)),
      reject,
      { binary: true, onlyVisible: true },
    )
  })
}

const scene = new THREE.Scene()
scene.add(buildZamboni())

const bytes = await exportBinary(scene)
await fs.writeFile(OUTPUT_PATH, bytes)
console.log(`wrote ${OUTPUT_PATH} (${bytes.byteLength} bytes)`)
