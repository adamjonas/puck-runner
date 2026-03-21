import { describe, it, expect } from 'vitest'
import { JitterBuffer } from './jitter-buffer'

describe('JitterBuffer', () => {
  it('disabled by default (delay=0) passes through immediately', () => {
    const buf = new JitterBuffer<number>(0)
    expect(buf.enabled).toBe(false)

    buf.push(42, 100)
    const result = buf.consume(100)
    expect(result).toEqual([42])
  })

  it('enabled buffer holds samples for delay duration', () => {
    const buf = new JitterBuffer<string>(50) // 50ms delay
    expect(buf.enabled).toBe(true)

    buf.push('a', 100)

    // Not ready yet at t=120
    expect(buf.consume(120)).toEqual([])

    // Ready at t=150
    expect(buf.consume(150)).toEqual(['a'])
  })

  it('releases multiple samples in order when their time comes', () => {
    const buf = new JitterBuffer<string>(30)

    buf.push('a', 100)
    buf.push('b', 116)
    buf.push('c', 133)

    // At t=130, only 'a' is ready (100+30=130)
    expect(buf.consume(130)).toEqual(['a'])

    // At t=170, both 'b' and 'c' are ready
    expect(buf.consume(170)).toEqual(['b', 'c'])
  })

  it('reset clears all buffered samples', () => {
    const buf = new JitterBuffer<number>(50)
    buf.push(1, 100)
    buf.push(2, 116)

    buf.reset()
    expect(buf.consume(200)).toEqual([])
  })

  it('does not grow unbounded', () => {
    const buf = new JitterBuffer<number>(50)
    // Push many samples
    for (let i = 0; i < 500; i++) {
      buf.push(i, i)
    }
    // Buffer should have trimmed old entries (max ~200 entries)
    // Just verify it doesn't crash and we can consume
    const result = buf.consume(1000)
    expect(result.length).toBeLessThan(500)
    expect(result.length).toBeGreaterThan(0)
  })
})
