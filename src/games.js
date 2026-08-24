/**
 * Мини-игры: фотограф (видоискатель) и супергерой (кликер по целям).
 * Id элементов совпадают с index.html.
 */

import { PHOTO_SUBJECTS, PHOTOS } from './data.js'
import { state, camera, costume, bonuses, photoIncome, heroIncome } from './state.js'
import { sfx } from './audio.js'
import { gameplayStart, gameplayStop } from './yandex.js'
import { spiderSVG } from './chibi.js'

let photoRaf = 0
let heroTimer = 0
let running = false
let photoSession = null
let heroSession = null

const $ = (id) => document.getElementById(id)

function rand(a, b) {
  return a + Math.random() * (b - a)
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/* ===================== ФОТОГРАФ ===================== */

export function startPhotoGame({ onDone }) {
  const cam = camera()
  const b = bonuses()
  photoSession = {
    onDone,
    shotsLeft: cam.shots,
    totalShots: cam.shots,
    results: [],
    t: Math.random() * 10,
    pattern: Math.random() < 0.5 ? 'horizontal' : 'circle',
    subject: pick(PHOTO_SUBJECTS),
    speed: cam.speed,
    contrast: b.contrast,
  }

  $('photo-shots').textContent = `0/${photoSession.totalShots}`
  $('photo-hint').textContent = 'Поймай объект в рамку и нажми «Снять»'
  $('photo-subject-label').textContent = photoSession.subject.label

  const subjectEl = $('photo-subject')
  paintPhotoSubject(subjectEl, photoSession.subject)
  subjectEl.classList.toggle('contrast', photoSession.contrast)

  const size = Math.round(118 * (cam.frameScale || 1))
  $('photo-frame').style.width = `${size}px`
  $('photo-frame').style.height = `${size}px`

  $('screen-photo').classList.remove('hidden')
  running = true
  gameplayStart()
  loopPhoto()
}

function loopPhoto() {
  if (!running || !photoSession) return
  const view = $('photo-view')
  const sub = $('photo-subject')
  const w = view.clientWidth
  const h = view.clientHeight
  const pad = 48
  photoSession.t += 0.016 * photoSession.speed * 1.35

  let x
  let y
  if (photoSession.pattern === 'horizontal') {
    x = pad + (Math.sin(photoSession.t) * 0.5 + 0.5) * (w - pad * 2)
    y = h * 0.46 + Math.sin(photoSession.t * 1.7) * (h * 0.18)
  } else {
    const rx = (w - pad * 2) * 0.38
    const ry = (h - pad * 2) * 0.32
    x = w / 2 + Math.cos(photoSession.t) * rx
    y = h / 2 + Math.sin(photoSession.t * 1.15) * ry
  }

  sub.style.left = `${x}px`
  sub.style.top = `${y}px`
  photoRaf = requestAnimationFrame(loopPhoto)
}

export function shootPhoto() {
  if (!running || !photoSession || photoSession.shotsLeft <= 0) return
  sfx.shoot()

  const view = $('photo-view')
  const frame = $('photo-frame')
  const sub = $('photo-subject')
  const vr = view.getBoundingClientRect()
  const fr = frame.getBoundingClientRect()
  const sr = sub.getBoundingClientRect()

  const dist = Math.hypot(
    fr.left + fr.width / 2 - (sr.left + sr.width / 2),
    fr.top + fr.height / 2 - (sr.top + sr.height / 2),
  )
  const perfectR = fr.width * 0.22
  const mediumR = fr.width * 0.48

  let quality
  let base
  if (dist <= perfectR) {
    quality = 'perfect'
    base = 12 * camera().perfectMult
    sfx.perfect()
    state.stats.perfectShots += 1
  } else if (dist <= mediumR) {
    quality = 'medium'
    base = 6
    sfx.tap()
  } else {
    quality = 'miss'
    base = 2
    sfx.miss()
  }

  const coins = photoIncome(base)
  photoSession.results.push({ quality, coins })
  photoSession.shotsLeft -= 1
  $('photo-shots').textContent =
    `${photoSession.totalShots - photoSession.shotsLeft}/${photoSession.totalShots}`
  flashQuality(quality, coins)

  const flash = $('photo-flash')
  flash.classList.remove('show')
  void flash.offsetWidth
  flash.classList.add('show')

  if (photoSession.shotsLeft <= 0) {
    finishPhoto()
    return
  }

  photoSession.subject = pick(PHOTO_SUBJECTS)
  photoSession.pattern = Math.random() < 0.5 ? 'horizontal' : 'circle'
  photoSession.t = Math.random() * 8
  paintPhotoSubject(sub, photoSession.subject)
  $('photo-subject-label').textContent = photoSession.subject.label
}

function paintPhotoSubject(el, subject) {
  if (subject.id === 'hero') {
    el.innerHTML = spiderSVG({ body: '#e11d48', accent: '#2563eb', glow: '#ff2bd6' })
    el.style.background = 'transparent'
    el.classList.add('chibi-sub')
  } else {
    el.textContent = subject.emoji
    el.style.background = subject.color
    el.classList.remove('chibi-sub')
  }
}

function flashQuality(quality, coins) {
  const el = $('photo-quality')
  const map = { perfect: 'Идеально!', medium: 'Нормально', miss: 'Почти…' }
  el.textContent = `${map[quality]}  +${coins}`
  el.className = `quality-pop ${quality}`
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.add('hidden'), 700)
}

function finishPhoto() {
  running = false
  cancelAnimationFrame(photoRaf)
  gameplayStop()
  $('screen-photo').classList.add('hidden')

  const cam = camera()
  const earned = photoSession.results.reduce((s, r) => s + r.coins, 0)
  const perfects = photoSession.results.filter((r) => r.quality === 'perfect').length
  let gotRare = Math.random() < 0.2 + cam.rareBonus
  if (cam.alwaysRarePerfect && perfects > 0) gotRare = true

  let rarePhoto = null
  let rareDuplicate = false
  if (gotRare) {
    rarePhoto = pick(PHOTOS)
    rareDuplicate = state.ownedPhotos.includes(rarePhoto.id)
  }

  const cb = photoSession.onDone
  const session = {
    type: 'photo',
    earned,
    details: photoSession.results,
    rarePhoto,
    rareDuplicate,
    perfects,
  }
  photoSession = null
  cb(session)
}

export function abortPhoto() {
  running = false
  cancelAnimationFrame(photoRaf)
  gameplayStop()
  $('screen-photo').classList.add('hidden')
  photoSession = null
}

/* ===================== ГЕРОЙ ===================== */

export function startHeroGame({ onDone }) {
  const c = costume()
  const b = bonuses()
  const duration = c.duration * 1000
  heroSession = {
    onDone,
    endsAt: performance.now() + duration,
    duration,
    slots: c.slots,
    superChance: c.superChance,
    superMult: c.superMult,
    spawnBonus: b.spawn,
    coins: 0,
    civilians: 0,
    criminals: 0,
    supers: 0,
    targets: new Map(),
    nextId: 1,
    lastSpawn: 0,
  }

  const city = $('hero-city')
  city.innerHTML = ''
  city.classList.toggle('space', b.spaceBg)
  city.appendChild(buildCityArt(b.spaceBg))

  $('hero-score').textContent = '0'
  $('screen-hero').classList.remove('hidden')
  running = true
  gameplayStart()
  const tryStart = () => {
    if (!running || !heroSession) return
    if (city.clientHeight < 80) {
      requestAnimationFrame(tryStart)
      return
    }
    spawnHeroTarget()
    if (c.slots > 1) spawnHeroTarget()
    heroSession.lastSpawn = performance.now()
    heroTimer = requestAnimationFrame(loopHero)
  }
  requestAnimationFrame(tryStart)
}

function buildCityArt(space) {
  const wrap = document.createElement('div')
  wrap.className = 'city-art'
  wrap.innerHTML = space
    ? `<div class="stars"></div><div class="planet"></div><div class="station"></div>`
    : `<div class="skyline"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="moon"></div>`
  return wrap
}

function spawnHeroTarget() {
  if (!running || !heroSession) return
  const city = $('hero-city')
  if (heroSession.targets.size >= heroSession.slots) return

  const roll = Math.random()
  let kind = 'civilian'
  if (heroSession.superChance > 0 && roll < heroSession.superChance) kind = 'super'
  else if (roll < 0.55) kind = 'criminal'

  const id = heroSession.nextId++
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `hero-target ${kind}`
  const labels = {
    civilian: { emoji: '😊', title: 'Житель' },
    criminal: { emoji: '😈', title: 'Преступник' },
    super: { emoji: '💀', title: 'Суперцель' },
  }
  el.innerHTML = `<span>${labels[kind].emoji}</span>`
  el.setAttribute('aria-label', labels[kind].title)

  const size = kind === 'super' ? 118 : 92
  const pad = 8
  const w = Math.max(80, city.clientWidth - size - pad)
  const h = Math.max(80, city.clientHeight - size - pad)
  el.style.left = `${pad + Math.random() * w}px`
  el.style.top = `${pad + Math.random() * h}px`
  el.style.width = `${size}px`
  el.style.height = `${size}px`

  const life = kind === 'super' ? rand(2200, 2800) : rand(2000, 3000)
  const timeout = setTimeout(() => despawn(id), life)
  const onHit = (e) => {
    e.preventDefault()
    e.stopPropagation()
    hitTarget(id)
  }
  el.addEventListener('pointerdown', onHit)
  el.addEventListener('click', onHit)

  city.appendChild(el)
  heroSession.targets.set(id, { el, kind, timeout })
}

function despawn(id) {
  if (!heroSession) return
  const t = heroSession.targets.get(id)
  if (!t) return
  clearTimeout(t.timeout)
  t.el.remove()
  heroSession.targets.delete(id)
}

function hitTarget(id) {
  if (!running || !heroSession) return
  const t = heroSession.targets.get(id)
  if (!t) return

  let base = 4
  if (t.kind === 'criminal') {
    base = 10
    heroSession.criminals += 1
    state.stats.criminalsCaught += 1
    sfx.heroHit()
  } else if (t.kind === 'super') {
    base = 40 * heroSession.superMult
    heroSession.supers += 1
    sfx.superHit()
  } else {
    heroSession.civilians += 1
    state.stats.civiliansSaved += 1
    sfx.heroHit()
  }

  const coins = heroIncome(base)
  heroSession.coins += coins
  $('hero-score').textContent = String(heroSession.coins)
  floatText(t.el, `+${coins}`)
  despawn(id)
}

function floatText(anchor, text) {
  const city = $('hero-city')
  const a = anchor.getBoundingClientRect()
  const c = city.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = 'float-coin'
  el.textContent = text
  el.style.left = `${a.left - c.left + a.width / 2}px`
  el.style.top = `${a.top - c.top}px`
  city.appendChild(el)
  setTimeout(() => el.remove(), 700)
}

function loopHero(now) {
  if (!running || !heroSession) return
  const left = Math.max(0, heroSession.endsAt - now)
  $('hero-timebar').style.width = `${(left / heroSession.duration) * 100}%`
  $('hero-time').textContent = `${Math.ceil(left / 1000)}с`

  if (now >= heroSession.endsAt) {
    finishHero()
    return
  }

  const interval = 1250 / (1 + heroSession.spawnBonus)
  if (heroSession.targets.size < heroSession.slots && now - heroSession.lastSpawn >= interval) {
    spawnHeroTarget()
    heroSession.lastSpawn = now
  }

  heroTimer = requestAnimationFrame(loopHero)
}

function clearHeroTargets() {
  if (!heroSession) return
  for (const t of heroSession.targets.values()) {
    clearTimeout(t.timeout)
    t.el.remove()
  }
  heroSession.targets.clear()
}

function finishHero() {
  running = false
  cancelAnimationFrame(heroTimer)
  clearHeroTargets()
  gameplayStop()
  $('screen-hero').classList.add('hidden')
  const cb = heroSession.onDone
  const session = {
    type: 'hero',
    earned: heroSession.coins,
    civilians: heroSession.civilians,
    criminals: heroSession.criminals,
    supers: heroSession.supers,
  }
  heroSession = null
  cb(session)
}

export function abortHero() {
  running = false
  cancelAnimationFrame(heroTimer)
  clearHeroTargets()
  gameplayStop()
  $('screen-hero').classList.add('hidden')
  heroSession = null
}
