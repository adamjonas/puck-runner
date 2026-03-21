import { describe, expect, it } from 'vitest'
import type { ClockSyncResponseMessage, TrackingInput } from '@shared/protocol'
import { LatencyProfiler } from './latency-profiler'

function makeInput(frameId: number): TrackingInput {
  return {
    type: 'input',
    ts: 1_700_000_000_000,
    raw: { x: 0.4, y: 0.5 },
    lane: 'center',
    deke: false,
    confidence: 0.9,
    stickhandling: {
      active: false,
      frequency: 0,
      amplitude: 0,
    },
    debugTiming: {
      frameId,
      captureTs: 1_000,
      detectDoneTs: 1_012,
      sendTs: 1_015,
    },
  }
}

describe('LatencyProfiler', () => {
  it('derives a browser-time offset from clock sync', () => {
    const profiler = new LatencyProfiler()
    const response: ClockSyncResponseMessage = {
      type: 'clock_sync_response',
      t1: 100,
      t2: 1_000,
    }

    profiler.recordClockSyncResponse(response, 110)

    expect(profiler.hasClockSync()).toBe(true)
  })

  it('computes stage timings after receive, apply, and render', () => {
    const profiler = new LatencyProfiler()
    profiler.recordClockSyncResponse({
      type: 'clock_sync_response',
      t1: 100,
      t2: 1_000,
    }, 110)

    const input = makeInput(7)
    profiler.recordReceived(input, 123)
    profiler.recordApplied(input, 125)

    const snapshot = profiler.finalizeRenderedSamples(141)

    expect(snapshot).not.toBeNull()
    expect(snapshot?.current.totalMs).toBeCloseTo(36, 3)
    expect(snapshot?.current.cameraToDetectMs).toBeCloseTo(12, 3)
    expect(snapshot?.current.detectToSendMs).toBeCloseTo(3, 3)
    expect(snapshot?.current.sendToRecvMs).toBeCloseTo(3, 3)
    expect(snapshot?.current.recvToApplyMs).toBeCloseTo(2, 3)
    expect(snapshot?.current.applyToRenderMs).toBeCloseTo(16, 3)
  })

  it('builds CSV output for recorded samples', () => {
    const profiler = new LatencyProfiler()
    profiler.recordClockSyncResponse({
      type: 'clock_sync_response',
      t1: 100,
      t2: 1_000,
    }, 110)

    const input = makeInput(9)
    profiler.recordReceived(input, 123)
    profiler.recordApplied(input, 125)
    profiler.finalizeRenderedSamples(141)

    const csv = profiler.buildCsv()

    expect(csv).toContain('recordedAtIso,frameId,totalMs')
    expect(csv).toContain(',9,')
  })
})
