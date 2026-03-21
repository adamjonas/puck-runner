/**
 * Generic jitter buffer. Holds samples for a fixed delay before releasing them,
 * smoothing out uneven arrival timing from the network.
 *
 * When delay=0 (default), acts as a passthrough with no buffering.
 */
export class JitterBuffer<T> {
  private buffer: Array<{ sample: T; playAt: number }> = []
  readonly delay: number

  /** @param delayMs Fixed delay in ms. 0 = disabled (passthrough). */
  constructor(delayMs = 0) {
    this.delay = delayMs
  }

  get enabled(): boolean {
    return this.delay > 0
  }

  push(sample: T, now: number): void {
    this.buffer.push({ sample, playAt: now + this.delay })
    // Cap at 200 entries to prevent unbounded growth
    while (this.buffer.length > 200) {
      this.buffer.shift()
    }
  }

  /** Returns all samples whose playback time has arrived. */
  consume(now: number): T[] {
    const ready: T[] = []
    while (this.buffer.length > 0 && this.buffer[0].playAt <= now) {
      ready.push(this.buffer.shift()!.sample)
    }
    return ready
  }

  reset(): void {
    this.buffer = []
  }
}
