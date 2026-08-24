/**
 * Музыка и эффекты из MP3.
 * Фоновые треки кроссфейдятся; эффекты слегка приглушают музыку, не глушат её.
 *
 * Громкости подогнаны по loudness исходников:
 * coin ≈ −16 дБ, фото-BGM ≈ −16 дБ, комната ≈ −26 дБ, промах ≈ −32 дБ.
 */

const SRC = {
  ui: './audio/ui.mp3',
  buy: './audio/buy.mp3',
  coin: './audio/coin.mp3',
  miss: './audio/miss.mp3',
  photo: './audio/photo.mp3',
  heroHit: './audio/hero-hit.mp3',
  room: './audio/bgm-room.mp3',
  photoBgm: './audio/bgm-photo.mp3',
  heroBgm: './audio/bgm-hero.mp3',
}

const VOL = {
  ui: 0.5,
  buy: 0.4,
  coin: 0.26,
  miss: 0.9,
  photo: 0.56,
  heroHit: 0.82,
  room: 0.3,
  photoBgm: 0.13,
  heroBgm: 0.14,
}

const SFX_DUCK_MS = {
  ui: 520,
  buy: 720,
  coin: 420,
  miss: 980,
  photo: 240,
  heroHit: 980,
}

let muted = false
let unlocked = false
let currentBgm = null
let duckTimer = 0
let fadeSeq = 0
let pauseToken = 0

const bgmA = new Audio()
const bgmB = new Audio()
let front = bgmA
let back = bgmB

for (const el of [bgmA, bgmB]) {
  el.loop = true
  el.preload = 'auto'
  el.volume = 0
}

const sfxProto = {
  ui: new Audio(SRC.ui),
  buy: new Audio(SRC.buy),
  coin: new Audio(SRC.coin),
  miss: new Audio(SRC.miss),
  photo: new Audio(SRC.photo),
  heroHit: new Audio(SRC.heroHit),
}
for (const a of Object.values(sfxProto)) a.preload = 'auto'

function bgmSrc(name) {
  if (name === 'photo') return SRC.photoBgm
  if (name === 'hero') return SRC.heroBgm
  return SRC.room
}

function bgmVol(name) {
  if (name === 'photo') return VOL.photoBgm
  if (name === 'hero') return VOL.heroBgm
  return VOL.room
}

function trackOf(el) {
  return el.dataset.track || ''
}

export function isMuted() {
  return muted
}

export function setMuted(value) {
  muted = Boolean(value)
  try {
    localStorage.setItem('spiderman_tycoon_mute', muted ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (muted) pauseBgm()
  else if (currentBgm) playBgm(currentBgm, { force: true })
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
  unlocked = true
  try {
    await front.play()
    front.pause()
  } catch {
    /* iOS: без жеста нельзя */
  }
  if (!muted && currentBgm) playBgm(currentBgm, { force: true })
}

function fade(el, to, ms) {
  const token = ++fadeSeq
  el._fadeToken = token
  const from = el.volume
  const t0 = performance.now()
  const tick = (now) => {
    if (el._fadeToken !== token) return
    const k = Math.min(1, (now - t0) / Math.max(1, ms))
    const ease = k * k * (3 - 2 * k)
    el.volume = Math.max(0, Math.min(1, from + (to - from) * ease))
    if (k < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function playBgm(name, { force = false } = {}) {
  if (!name) return
  currentBgm = name
  pauseToken += 1
  if (muted || !unlocked) return

  const url = bgmSrc(name)
  const target = bgmVol(name)

  if (trackOf(front) === name) {
    if (!front.paused && !force) {
      fade(front, target, 280)
      return
    }
    const start = front.play()
    if (start && typeof start.catch === 'function') start.catch(() => {})
    fade(front, target, 640)
    return
  }

  const incoming = back
  const outgoing = front

  incoming.dataset.track = name
  incoming.src = url
  incoming.loop = true
  incoming.volume = 0
  const start = incoming.play()
  if (start && typeof start.catch === 'function') start.catch(() => {})

  fade(incoming, target, 820)
  if (!outgoing.paused || outgoing.volume > 0.02) fade(outgoing, 0, 560)
  setTimeout(() => {
    if (outgoing !== front) {
      outgoing.pause()
      outgoing.dataset.track = ''
    }
  }, 600)

  front = incoming
  back = outgoing
}

export function pauseBgm() {
  const token = ++pauseToken
  fade(front, 0, 320)
  fade(back, 0, 320)
  setTimeout(() => {
    if (token !== pauseToken) return
    front.pause()
    back.pause()
  }, 340)
}

export function resumeBgm() {
  if (muted || !currentBgm) return
  playBgm(currentBgm, { force: true })
}

function duck(key) {
  if (muted || front.paused) return
  const base = bgmVol(currentBgm || 'room')
  fade(front, base * 0.5, 90)
  clearTimeout(duckTimer)
  duckTimer = setTimeout(() => {
    if (!muted && !front.paused) fade(front, base, 280)
  }, SFX_DUCK_MS[key] ?? 360)
}

function playSfx(key) {
  if (muted || !unlocked) return
  const proto = sfxProto[key]
  if (!proto) return
  duck(key)
  const node = proto.cloneNode()
  node.volume = VOL[key] ?? 0.5
  const p = node.play()
  if (p && typeof p.catch === 'function') p.catch(() => {})
}

const sfxApi = {
  tap() {
    playSfx('ui')
  },
  coin() {
    playSfx('coin')
  },
  win() {
    playSfx('coin')
  },
  shoot() {},
  perfect() {
    playSfx('photo')
  },
  miss() {
    playSfx('miss')
  },
  heroHit() {
    playSfx('heroHit')
  },
  superHit() {
    playSfx('heroHit')
  },
  error() {
    playSfx('miss')
  },
  rare() {
    playSfx('photo')
  },
  upgrade() {
    playSfx('buy')
  },
}

export { sfxApi as sfx }
