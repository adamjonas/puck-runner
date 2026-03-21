import type {
  ClockSyncRequestMessage,
  ClockSyncResponseMessage,
  TrackingDebugTiming,
  TrackingInput,
} from '@shared/protocol'

const HISTORY_LIMIT = 30
const EXPORT_LIMIT = 10_000

interface PendingLatencySample {
  frameId: number
  timing: TrackingDebugTiming
  recvTs: number
  applyTs?: number
}

export interface LatencyMetrics {
  frameId: number
  totalMs: number
  cameraToDetectMs: number
  detectToSendMs: number
  sendToRecvMs: number
  recvToApplyMs: number
  applyToRenderMs: number
}

export interface LatencySnapshot {
  current: LatencyMetrics
  average: LatencyMetrics
  summaryText: string
}

interface LatencyRecord extends LatencyMetrics {
  recordedAtIso: string
  captureTsBrowser: number
  detectDoneTsBrowser: number
  sendTsBrowser: number
  recvTsBrowser: number
  applyTsBrowser: number
  renderTsBrowser: number
  phoneToBrowserOffsetMs: number
  clockSyncRttMs: number
}

export class LatencyProfiler {
  private readonly pending = new Map<number, PendingLatencySample>()
  private readonly history: LatencyMetrics[] = []
  private readonly records: LatencyRecord[] = []
  private phoneToBrowserOffsetMs: number | null = null
  private bestClockSyncRttMs: number | null = null

  createClockSyncRequest(now: number): ClockSyncRequestMessage {
    return {
      type: 'clock_sync_request',
      t1: now,
    }
  }

  recordClockSyncResponse(message: ClockSyncResponseMessage, recvTs: number): void {
    const rtt = recvTs - message.t1
    if (!Number.isFinite(rtt) || rtt <= 0) return

    const midpoint = (message.t1 + recvTs) / 2
    const offset = midpoint - message.t2

    if (this.bestClockSyncRttMs === null || rtt < this.bestClockSyncRttMs) {
      this.bestClockSyncRttMs = rtt
      this.phoneToBrowserOffsetMs = offset
    }
  }

  recordReceived(input: TrackingInput, recvTs: number): void {
    const timing = input.debugTiming
    if (!timing) return

    this.pending.set(timing.frameId, {
      frameId: timing.frameId,
      timing,
      recvTs,
    })
    this.prunePending(timing.frameId)
  }

  recordApplied(input: TrackingInput, applyTs: number): void {
    const timing = input.debugTiming
    if (!timing) return

    const pending = this.pending.get(timing.frameId)
    if (pending) {
      pending.applyTs = applyTs
      return
    }

    this.pending.set(timing.frameId, {
      frameId: timing.frameId,
      timing,
      recvTs: applyTs,
      applyTs,
    })
    this.prunePending(timing.frameId)
  }

  finalizeRenderedSamples(renderTs: number): LatencySnapshot | null {
    let latest: LatencyMetrics | null = null

    for (const [frameId, pending] of this.pending) {
      if (pending.applyTs === undefined) continue

      const metrics = this.buildMetrics(pending, renderTs)
      this.pending.delete(frameId)
      if (!metrics) continue

      this.history.push(metrics)
      if (this.history.length > HISTORY_LIMIT) {
        this.history.shift()
      }
      this.records.push(metrics)
      if (this.records.length > EXPORT_LIMIT) {
        this.records.shift()
      }
      latest = metrics
    }

    if (!latest || this.history.length === 0) {
      return null
    }

    const average = this.averageMetrics()
    return {
      current: latest,
      average,
      summaryText: this.formatSummary(average),
    }
  }

  getStatusText(): string {
    if (this.phoneToBrowserOffsetMs === null) {
      return 'LAT syncing clocks...'
    }

    if (this.history.length === 0) {
      const rtt = this.bestClockSyncRttMs ?? 0
      return `LAT waiting for samples | RTT ${rtt.toFixed(1)}ms`
    }

    return this.formatSummary(this.averageMetrics())
  }

  hasClockSync(): boolean {
    return this.phoneToBrowserOffsetMs !== null
  }

  buildCsv(): string | null {
    if (this.records.length === 0) return null

    const header = [
      'recordedAtIso',
      'frameId',
      'totalMs',
      'cameraToDetectMs',
      'detectToSendMs',
      'sendToRecvMs',
      'recvToApplyMs',
      'applyToRenderMs',
      'captureTsBrowser',
      'detectDoneTsBrowser',
      'sendTsBrowser',
      'recvTsBrowser',
      'applyTsBrowser',
      'renderTsBrowser',
      'phoneToBrowserOffsetMs',
      'clockSyncRttMs',
    ]

    const rows = this.records.map((record) => [
      record.recordedAtIso,
      record.frameId,
      record.totalMs.toFixed(3),
      record.cameraToDetectMs.toFixed(3),
      record.detectToSendMs.toFixed(3),
      record.sendToRecvMs.toFixed(3),
      record.recvToApplyMs.toFixed(3),
      record.applyToRenderMs.toFixed(3),
      record.captureTsBrowser.toFixed(3),
      record.detectDoneTsBrowser.toFixed(3),
      record.sendTsBrowser.toFixed(3),
      record.recvTsBrowser.toFixed(3),
      record.applyTsBrowser.toFixed(3),
      record.renderTsBrowser.toFixed(3),
      record.phoneToBrowserOffsetMs.toFixed(3),
      record.clockSyncRttMs.toFixed(3),
    ].join(','))

    return [header.join(','), ...rows].join('\n')
  }

  downloadCsv(): boolean {
    const csv = this.buildCsv()
    if (!csv) return false

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `puck-runner-latency-${new Date().toISOString().replaceAll(':', '-')}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    return true
  }

  private buildMetrics(
    pending: PendingLatencySample,
    renderTs: number,
  ): LatencyRecord | null {
    if (this.phoneToBrowserOffsetMs === null || pending.applyTs === undefined) {
      return null
    }

    const captureTs = pending.timing.captureTs + this.phoneToBrowserOffsetMs
    const detectDoneTs = pending.timing.detectDoneTs + this.phoneToBrowserOffsetMs
    const sendTs = pending.timing.sendTs + this.phoneToBrowserOffsetMs
    const clockSyncRttMs = this.bestClockSyncRttMs ?? 0

    return {
      recordedAtIso: new Date().toISOString(),
      frameId: pending.frameId,
      totalMs: renderTs - captureTs,
      cameraToDetectMs: detectDoneTs - captureTs,
      detectToSendMs: sendTs - detectDoneTs,
      sendToRecvMs: pending.recvTs - sendTs,
      recvToApplyMs: pending.applyTs - pending.recvTs,
      applyToRenderMs: renderTs - pending.applyTs,
      captureTsBrowser: captureTs,
      detectDoneTsBrowser: detectDoneTs,
      sendTsBrowser: sendTs,
      recvTsBrowser: pending.recvTs,
      applyTsBrowser: pending.applyTs,
      renderTsBrowser: renderTs,
      phoneToBrowserOffsetMs: this.phoneToBrowserOffsetMs,
      clockSyncRttMs,
    }
  }

  private averageMetrics(): LatencyMetrics {
    const total = this.history.reduce(
      (acc, sample) => {
        acc.totalMs += sample.totalMs
        acc.cameraToDetectMs += sample.cameraToDetectMs
        acc.detectToSendMs += sample.detectToSendMs
        acc.sendToRecvMs += sample.sendToRecvMs
        acc.recvToApplyMs += sample.recvToApplyMs
        acc.applyToRenderMs += sample.applyToRenderMs
        return acc
      },
      {
        totalMs: 0,
        cameraToDetectMs: 0,
        detectToSendMs: 0,
        sendToRecvMs: 0,
        recvToApplyMs: 0,
        applyToRenderMs: 0,
      },
    )
    const count = this.history.length || 1
    const latestFrameId = this.history[this.history.length - 1]?.frameId ?? 0

    return {
      frameId: latestFrameId,
      totalMs: total.totalMs / count,
      cameraToDetectMs: total.cameraToDetectMs / count,
      detectToSendMs: total.detectToSendMs / count,
      sendToRecvMs: total.sendToRecvMs / count,
      recvToApplyMs: total.recvToApplyMs / count,
      applyToRenderMs: total.applyToRenderMs / count,
    }
  }

  private formatSummary(metrics: LatencyMetrics): string {
    const rtt = this.bestClockSyncRttMs ?? 0
    return [
      `LAT ${Math.round(metrics.totalMs)}ms`,
      `C>D ${Math.round(metrics.cameraToDetectMs)}`,
      `D>S ${Math.round(metrics.detectToSendMs)}`,
      `S>R ${Math.round(metrics.sendToRecvMs)}`,
      `R>A ${Math.round(metrics.recvToApplyMs)}`,
      `A>R ${Math.round(metrics.applyToRenderMs)}`,
      `RTT ${Math.round(rtt)}ms`,
    ].join(' | ')
  }

  private prunePending(currentFrameId: number): void {
    for (const [frameId] of this.pending) {
      if (frameId < currentFrameId - HISTORY_LIMIT) {
        this.pending.delete(frameId)
      }
    }
  }
}
