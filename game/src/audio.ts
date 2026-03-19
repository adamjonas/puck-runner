/**
 * Synthesized sound effects using Web Audio API.
 * All sounds are generated programmatically — no audio files needed.
 */

export type SoundName =
  | 'coin'
  | 'hit'
  | 'deke'
  | 'combo'
  | 'silky_mitts'
  | 'game_over'
  | 'countdown'
  | 'go'
  | 'life_lost'

let ctx: AudioContext | null = null

/** Maximum concurrent sound nodes to prevent audio overload. */
const MAX_CONCURRENT = 8
let activeSounds = 0

/** Create or resume the AudioContext. Call on first user interaction. */
export function initAudio(): void {
  if (!ctx) {
    ctx = new AudioContext()
  }
  if (ctx.state === 'suspended') {
    ctx.resume()
  }
}

/**
 * Play a named sound effect.
 * Silently no-ops if AudioContext is not yet initialised or if
 * the concurrent sound limit has been reached.
 */
export function playSound(name: SoundName): void {
  if (!ctx || activeSounds >= MAX_CONCURRENT) return

  activeSounds++
  const done = () => {
    activeSounds = Math.max(0, activeSounds - 1)
  }

  switch (name) {
    case 'coin':
      playCoin(ctx, done)
      break
    case 'hit':
      playHit(ctx, done)
      break
    case 'deke':
      playDeke(ctx, done)
      break
    case 'combo':
      playCombo(ctx, done)
      break
    case 'silky_mitts':
      playSilkyMitts(ctx, done)
      break
    case 'game_over':
      playGameOver(ctx, done)
      break
    case 'countdown':
      playCountdown(ctx, done)
      break
    case 'go':
      playGo(ctx, done)
      break
    case 'life_lost':
      playLifeLost(ctx, done)
      break
  }
}

// ---------------------------------------------------------------------------
// Individual sound generators
// ---------------------------------------------------------------------------

/** Short high-pitched blip — 800 Hz sine, 0.1 s */
function playCoin(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.1

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'sine'
  osc.frequency.value = 800

  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Low thud — 150 Hz triangle with fast decay, 0.3 s */
function playHit(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.3

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'triangle'
  osc.frequency.value = 150

  gain.gain.setValueAtTime(0.5, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Quick whoosh — white noise through bandpass filter sweeping 500→2000 Hz, 0.2 s */
function playDeke(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.2
  const sampleRate = ac.sampleRate
  const length = Math.ceil(sampleRate * dur)

  // Create white noise buffer
  const buffer = ac.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const source = ac.createBufferSource()
  source.buffer = buffer

  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.Q.value = 2
  filter.frequency.setValueAtTime(500, now)
  filter.frequency.exponentialRampToValueAtTime(2000, now + dur)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  source.connect(filter).connect(gain).connect(ac.destination)
  source.start(now)
  source.stop(now + dur)
  source.onended = done
}

/** Ascending 3-note arpeggio — 400, 500, 600 Hz, 0.3 s total */
function playCombo(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const noteLen = 0.1
  const freqs = [400, 500, 600]

  freqs.forEach((freq, i) => {
    const t = now + i * noteLen
    const osc = ac.createOscillator()
    const gain = ac.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    gain.gain.setValueAtTime(0.25, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + noteLen)

    osc.connect(gain).connect(ac.destination)
    osc.start(t)
    osc.stop(t + noteLen)

    // Only attach done to the last note
    if (i === freqs.length - 1) {
      osc.onended = done
    }
  })
}

/** Sparkle — high sine 1200 Hz with vibrato (LFO), 0.5 s */
function playSilkyMitts(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.5

  const osc = ac.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 1200

  // Vibrato via LFO modulating frequency
  const lfo = ac.createOscillator()
  const lfoGain = ac.createGain()
  lfo.type = 'sine'
  lfo.frequency.value = 15 // vibrato rate
  lfoGain.gain.value = 60 // vibrato depth in Hz
  lfo.connect(lfoGain).connect(osc.frequency)
  lfo.start(now)
  lfo.stop(now + dur)

  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.001, now)
  gain.gain.linearRampToValueAtTime(0.3, now + 0.05)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Descending tone — sawtooth 400→100 Hz, 0.8 s */
function playGameOver(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.8

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(400, now)
  osc.frequency.exponentialRampToValueAtTime(100, now + dur)

  gain.gain.setValueAtTime(0.25, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Short beep — 600 Hz sine, 0.15 s */
function playCountdown(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.15

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'sine'
  osc.frequency.value = 600

  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Higher beep — 900 Hz sine, 0.3 s */
function playGo(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.3

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'sine'
  osc.frequency.value = 900

  gain.gain.setValueAtTime(0.35, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}

/** Short descending tone — 300→150 Hz, 0.3 s */
function playLifeLost(ac: AudioContext, done: () => void): void {
  const now = ac.currentTime
  const dur = 0.3

  const osc = ac.createOscillator()
  const gain = ac.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(300, now)
  osc.frequency.exponentialRampToValueAtTime(150, now + dur)

  gain.gain.setValueAtTime(0.35, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur)

  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur)
  osc.onended = done
}
