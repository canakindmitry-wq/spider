/**
 * Короткие звуки через Web Audio API — без внешних файлов.
 * Игра запускается сразу, звук включается после первого касания.
 */

let ctx = null
let muted = false
let unlocked = false

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = value
  try {
    localStorage.setItem('spiderman_tycoon_mute', value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadMute() {
  try {
    muted = localStorage.getItem('spiderman_tycoon_mute') === '1'
  } catch {
    muted = false
  }
  return muted
}

export async function unlockAudio() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') {
    try {
      await c.resume()
    } catch {
      /* ignore */
    }
  }
  unlocked = true
}

function beep(freq, dur, type = 'square', gain = 0.06, slide = 0) {
  if (muted || !unlocked) return
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime)
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, c.currentTime + dur)
  g.gain.setValueAtTime(gain, c.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + dur + 0.02)
}

export const sfx = {
  tap() {
    beep(520, 0.06, 'square', 0.05)
  },
  coin() {
    beep(880, 0.09, 'square', 0.06, 220)
  },
  win() {
    beep(523, 0.08, 'triangle', 0.07)
    setTimeout(() => beep(659, 0.08, 'triangle', 0.07), 90)
    setTimeout(() => beep(784, 0.16, 'triangle', 0.08), 180)
  },
  shoot() {
    beep(180, 0.08, 'sawtooth', 0.05)
    beep(720, 0.05, 'square', 0.04)
  },
  perfect() {
    beep(880, 0.07, 'triangle', 0.07, 200)
    setTimeout(() => beep(1174, 0.12, 'triangle', 0.07), 70)
  },
  miss() {
    beep(180, 0.14, 'sawtooth', 0.05, -60)
  },
  heroHit() {
    beep(640, 0.07, 'square', 0.05)
  },
  superHit() {
    beep(392, 0.08, 'triangle', 0.07)
    setTimeout(() => beep(784, 0.14, 'triangle', 0.07), 80)
  },
  error() {
    beep(140, 0.18, 'square', 0.05)
  },
  rare() {
    beep(523, 0.1, 'triangle', 0.07)
    setTimeout(() => beep(659, 0.1, 'triangle', 0.07), 100)
    setTimeout(() => beep(784, 0.1, 'triangle', 0.07), 200)
    setTimeout(() => beep(1046, 0.18, 'triangle', 0.08), 300)
  },
  upgrade() {
    beep(440, 0.08, 'square', 0.06)
    setTimeout(() => beep(660, 0.12, 'square', 0.06), 80)
  },
}
