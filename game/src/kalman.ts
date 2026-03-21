/**
 * Single-axis Kalman filter tracking position + velocity.
 * Constant-velocity process model with scalar position measurement.
 *
 * State vector: [position, velocity]
 * Process model: pos' = pos + vel*dt, vel' = vel
 * Measurement: z = pos
 */
export class KalmanAxis {
  // State
  private x: number
  private v: number

  // Covariance (2x2 symmetric: p00, p01=p10, p11)
  private p00: number
  private p01: number
  private p11: number

  // Tuning
  private readonly q: number // process noise intensity
  private readonly rBase: number // base measurement noise

  constructor(
    initialPosition: number,
    processNoise = 0.5,
    measurementNoise = 0.005,
  ) {
    this.x = initialPosition
    this.v = 0
    this.q = processNoise
    this.rBase = measurementNoise
    // High initial uncertainty
    this.p00 = 1
    this.p01 = 0
    this.p11 = 1
  }

  /** Predict forward by dt seconds. Call once per frame. */
  predict(dt: number): void {
    // State prediction
    this.x += this.v * dt

    // Covariance prediction: P' = F P F^T + Q
    const dt2 = dt * dt
    const dt3 = dt2 * dt
    const q = this.q

    const new_p00 = this.p00 + dt * 2 * this.p01 + dt2 * this.p11 + q * dt3 / 3
    const new_p01 = this.p01 + dt * this.p11 + q * dt2 / 2
    const new_p11 = this.p11 + q * dt

    this.p00 = new_p00
    this.p01 = new_p01
    this.p11 = new_p11
  }

  /** Update with a position measurement. Confidence scales measurement noise. */
  update(measurement: number, confidence = 1.0): void {
    // Scale measurement noise inversely with confidence squared
    const r = this.rBase / Math.max(confidence * confidence, 0.04)

    // Innovation
    const y = measurement - this.x

    // Innovation covariance
    const s = this.p00 + r

    // Kalman gain
    const k0 = this.p00 / s
    const k1 = this.p01 / s

    // State update
    this.x += k0 * y
    this.v += k1 * y

    // Covariance update: P' = (I - KH) P
    const new_p00 = this.p00 - k0 * this.p00
    const new_p01 = this.p01 - k0 * this.p01
    const new_p11 = this.p11 - k1 * this.p01

    this.p00 = new_p00
    this.p01 = new_p01
    this.p11 = new_p11
  }

  get position(): number {
    return this.x
  }

  get velocity(): number {
    return this.v
  }
}
