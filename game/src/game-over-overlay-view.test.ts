import { describe, it, expect } from 'vitest'
import { buildGameOverMessage, formatGameDuration } from './game-over-overlay-view'

describe('formatGameDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatGameDuration(5000)).toBe('5s')
    expect(formatGameDuration(1000)).toBe('1s')
    expect(formatGameDuration(59000)).toBe('59s')
  })

  it('formats durations of 60s+ as m:ss', () => {
    expect(formatGameDuration(60000)).toBe('1:00')
    expect(formatGameDuration(65000)).toBe('1:05')
    expect(formatGameDuration(125000)).toBe('2:05')
  })

  it('clamps minimum to 1s', () => {
    expect(formatGameDuration(0)).toBe('1s')
    expect(formatGameDuration(500)).toBe('1s')
  })

  it('pads single-digit seconds in m:ss format', () => {
    expect(formatGameDuration(63000)).toBe('1:03')
  })

  it('floors partial seconds', () => {
    expect(formatGameDuration(5999)).toBe('5s')
    expect(formatGameDuration(61500)).toBe('1:01')
  })
})

describe('buildGameOverMessage', () => {
  it('returns high score message with duration', () => {
    const msg = buildGameOverMessage('CORA #12', 45000, true)
    expect(msg).toContain('CORA #12')
    expect(msg).toContain('personal best')
    expect(msg).toContain('45s')
  })

  it('returns high score message with m:ss format for long runs', () => {
    const msg = buildGameOverMessage('Player', 125000, true)
    expect(msg).toContain('2:05')
    expect(msg).toContain('personal best')
  })

  it('returns short run message for < 15 seconds', () => {
    const msg = buildGameOverMessage('Player', 10000, false)
    expect(msg).toContain('Nice try')
    expect(msg).toContain('10s')
  })

  it('returns medium run message for 15-29 seconds', () => {
    const msg = buildGameOverMessage('Player', 20000, false)
    expect(msg).toContain('Good shift')
    expect(msg).toContain('20s')
  })

  it('returns strong run message for 30-59 seconds', () => {
    const msg = buildGameOverMessage('Player', 45000, false)
    expect(msg).toContain('Strong effort')
    expect(msg).toContain('45s')
  })

  it('returns great run message for 60+ seconds', () => {
    const msg = buildGameOverMessage('Player', 90000, false)
    expect(msg).toContain('Great run')
    expect(msg).toContain('1:30')
  })

  it('clamps minimum seconds to 1', () => {
    const msg = buildGameOverMessage('Player', 0, false)
    expect(msg).toContain('1s')
  })

  it('boundary: exactly 15 seconds falls into medium bucket', () => {
    const msg = buildGameOverMessage('Player', 15000, false)
    expect(msg).toContain('Good shift')
  })

  it('boundary: exactly 30 seconds falls into strong bucket', () => {
    const msg = buildGameOverMessage('Player', 30000, false)
    expect(msg).toContain('Strong effort')
  })

  it('boundary: exactly 60 seconds falls into great bucket', () => {
    const msg = buildGameOverMessage('Player', 60000, false)
    expect(msg).toContain('Great run')
  })

  it('high score takes priority over duration bucket', () => {
    const msg = buildGameOverMessage('Player', 5000, true)
    expect(msg).toContain('personal best')
    expect(msg).not.toContain('Nice try')
  })

  it('uses player name in high score message', () => {
    const msg = buildGameOverMessage('COLBY #27', 30000, true)
    expect(msg).toContain('COLBY #27')
  })
})
