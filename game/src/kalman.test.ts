import { describe, it, expect } from 'vitest'
import { KalmanAxis } from './kalman'

describe('KalmanAxis', () => {
  it('starts at initial position with zero velocity', () => {
    const kf = new KalmanAxis(0.5)
    expect(kf.position).toBe(0.5)
    expect(kf.velocity).toBe(0)
  })

  it('predict moves position by velocity * dt', () => {
    const kf = new KalmanAxis(0)
    // Feed two measurements to establish velocity
    kf.predict(0.016)
    kf.update(0.1)
    kf.predict(0.016)
    kf.update(0.2)

    const posBefore = kf.position
    kf.predict(0.016)
    // Should have moved forward (velocity is positive)
    expect(kf.position).toBeGreaterThan(posBefore)
  })

  it('converges toward repeated measurement', () => {
    const kf = new KalmanAxis(0)
    for (let i = 0; i < 20; i++) {
      kf.predict(0.016)
      kf.update(1.0)
    }
    expect(kf.position).toBeCloseTo(1.0, 1)
  })

  it('low confidence slows convergence vs high confidence', () => {
    const kfHigh = new KalmanAxis(0)
    const kfLow = new KalmanAxis(0)

    kfHigh.predict(0.016)
    kfHigh.update(1.0, 1.0)

    kfLow.predict(0.016)
    kfLow.update(1.0, 0.2)

    expect(kfHigh.position).toBeGreaterThan(kfLow.position)
  })

  it('handles dropped frames (multiple predicts)', () => {
    const kf = new KalmanAxis(0.3)

    // Feed several measurements to establish clear velocity
    for (let i = 1; i <= 5; i++) {
      kf.predict(0.016)
      kf.update(0.3 + i * 0.05)
    }
    const posAfterUpdates = kf.position

    // Simulate 3 dropped frames — predict without update
    kf.predict(0.016)
    kf.predict(0.016)
    kf.predict(0.016)

    // Position should have continued past where updates ended
    expect(kf.position).toBeGreaterThan(posAfterUpdates)
  })

  it('tracks a direction reversal', () => {
    const kf = new KalmanAxis(0.5)

    // Move right
    for (let i = 0; i < 5; i++) {
      kf.predict(0.016)
      kf.update(0.5 + (i + 1) * 0.05)
    }
    expect(kf.velocity).toBeGreaterThan(0)

    // Reverse direction
    for (let i = 0; i < 10; i++) {
      kf.predict(0.016)
      kf.update(0.75 - (i + 1) * 0.05)
    }
    expect(kf.velocity).toBeLessThan(0)
  })
})
