import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT_PATH = path.resolve(SCRIPT_DIR, '../public/models/broken-ice-original.glb')

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

function add(root, geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(...position)
  mesh.rotation.set(...rotation)
  mesh.scale.set(...scale)
  mesh.castShadow = true
  mesh.receiveShadow = false
  root.add(mesh)
  return mesh
}

function buildBrokenIce() {
  const group = new THREE.Group()
  group.name = 'OriginalBrokenIce'

  const iceTop = new THREE.MeshStandardMaterial({ color: 0xe6f5ff, roughness: 0.16, metalness: 0.1 })
  const iceSide = new THREE.MeshStandardMaterial({ color: 0x9fd4f6, roughness: 0.28, metalness: 0.08 })
  const crackDark = new THREE.MeshStandardMaterial({ color: 0x09101a, roughness: 0.92, metalness: 0.02 })
  const glow = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, emissive: 0x38bdf8, emissiveIntensity: 1.1, roughness: 0.2, metalness: 0.0 })
  const frost = new THREE.MeshStandardMaterial({ color: 0xf7fcff, roughness: 0.88, metalness: 0.0 })

  const leftSheet = new THREE.Group()
  add(leftSheet, new THREE.BoxGeometry(2.7, 0.16, 6.5), iceTop, [-1.8, 0.08, 0], [0, -0.1, 0.03])
  add(leftSheet, new THREE.BoxGeometry(2.7, 0.18, 6.45), iceSide, [-1.8, -0.02, 0], [0, -0.1, 0.03])
  group.add(leftSheet)

  const rightSheet = new THREE.Group()
  add(rightSheet, new THREE.BoxGeometry(2.6, 0.16, 6.2), iceTop, [1.95, 0.07, 0.18], [0, 0.12, -0.03])
  add(rightSheet, new THREE.BoxGeometry(2.6, 0.18, 6.15), iceSide, [1.95, -0.03, 0.18], [0, 0.12, -0.03])
  group.add(rightSheet)

  add(group, new THREE.BoxGeometry(1.0, 0.05, 6.8), crackDark, [0.05, 0.03, 0], [0, 0.03, 0])
  add(group, new THREE.BoxGeometry(0.7, 0.02, 5.6), glow, [0.03, 0.045, -0.1], [0, -0.06, 0])

  for (const [x, z, sx, sy, sz, ry] of [
    [-0.5, 0.9, 0.7, 0.28, 0.55, -0.45],
    [0.35, -0.6, 0.55, 0.34, 0.5, 0.38],
    [-0.15, -2.1, 0.6, 0.22, 0.8, -0.22],
    [0.55, 2.25, 0.45, 0.26, 0.72, 0.31],
  ]) {
    add(group, new THREE.BoxGeometry(sx, sy, sz), iceSide, [x, sy * 0.5, z], [0.08, ry, 0.12])
    add(group, new THREE.BoxGeometry(sx * 0.88, sy * 0.18, sz * 0.82), frost, [x, sy + 0.03, z], [0.08, ry, 0.12])
  }

  for (const [x, z, h, ry] of [
    [-2.8, 2.0, 0.45, -0.6],
    [-2.45, -1.3, 0.35, 0.42],
    [2.55, 1.55, 0.4, 0.55],
    [2.35, -2.05, 0.32, -0.3],
    [0.2, 1.2, 0.25, 0.2],
    [-0.25, -1.5, 0.28, -0.15],
  ]) {
    add(group, new THREE.ConeGeometry(0.18, h, 5), frost, [x, h * 0.5, z], [0, ry, 0])
  }

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
scene.add(buildBrokenIce())

const bytes = await exportBinary(scene)
await fs.writeFile(OUTPUT_PATH, bytes)
console.log(`wrote ${OUTPUT_PATH} (${bytes.byteLength} bytes)`)
