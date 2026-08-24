/**
 * Интерфейс комнаты, панели прокачки, итоги смен и офлайн-награда.
 * Все id совпадают с index.html.
 */

import {
  COSTUME_LEVELS,
  CAMERA_LEVELS,
  PASSIVE_LEVELS,
  ROOM_ITEMS,
  COIN_SKINS,
  PAID_SKINS,
  PHOTOS,
  ACHIEVEMENTS,
  PREMIUM,
  getSkinById,
} from './data.js'
import {
  state,
  costume,
  camera,
  passive,
  addCoins,
  spendCoins,
  saveState,
  checkAchievements,
  nextCostumeCost,
  nextCameraCost,
  nextPassiveCost,
  hasItem,
  canWatchTv,
  markTvWatched,
  collectPassiveCoins,
  touchLastVisit,
  palette,
  equippedSkinData,
  hangingPhotoBonusPercent,
  passivePerMin,
  tvCooldownLeft,
  formatCountdown,
  maxPassiveBank,
  TV_REWARD,
  INTERSTITIAL_MS,
  nextCostumePreview,
  nextCameraPreview,
  nextPassivePreview,
} from './state.js'
import { sfx, isMuted, setMuted, unlockAudio, playBgm } from './audio.js'
import { startPhotoGame, startHeroGame, shootPhoto, abortPhoto, abortHero, isMinigameOpen } from './games.js'
import { showRewarded, showInterstitial, purchaseProduct, gameplayStart } from './yandex.js'
import { spiderSVG } from './chibi.js'

export { spiderSVG }

const $ = (id) => document.getElementById(id)

let lastShift = null
let doubledThisShift = false
let interstitialBusy = false
const achievementQueue = []
let showingAchievement = false
let uiBound = false
let gameStarted = false

function skinThumb(skin) {
  return `<div class="skin-ico chibi">${spiderSVG(skin.colors, { rainbow: skin.rainbow })}</div>`
}

export function renderHud() {
  $('hud-coins').textContent = String(state.coins)
  $('hud-passive').textContent = `+${passivePerMin()}/мин`
  $('btn-mute').textContent = isMuted() ? '🔇' : '🔊'
}

export function bounceCoins() {
  const el = $('hud-coins-wrap')
  el.classList.remove('pop')
  void el.offsetWidth
  el.classList.add('pop')
}

export function toast(text) {
  const el = $('toast')
  el.textContent = text
  el.classList.add('show')
  clearTimeout(el._t)
  el._t = setTimeout(() => el.classList.remove('show'), 1800)
}

function enqueueAchievements(list) {
  for (const a of list) achievementQueue.push(a)
  pumpAchievements()
}

function pumpAchievements() {
  if (showingAchievement || !achievementQueue.length) return
  const a = achievementQueue.shift()
  showingAchievement = true
  sfx.win()
  $('ach-pop-emoji').textContent = a.emoji
  $('ach-pop-name').textContent = a.name
  $('ach-pop-reward').textContent = `+${a.reward} монет`
  $('achievement-pop').classList.remove('hidden')
  renderHud()
}

function afterCoins(unlocked) {
  renderHud()
  bounceCoins()
  sfx.coin()
  enqueueAchievements(unlocked || checkAchievements())
}

export function renderRoom() {
  const pal = palette()
  const rain = Boolean(equippedSkinData()?.rainbow)
  $('hanger-suit').innerHTML = spiderSVG(pal, {
    rainbow: rain,
    torn: state.costumeLevel === 1 && !state.equippedSkin,
  })
  const winSpidey = $('window-spidey')
  if (winSpidey) winSpidey.innerHTML = spiderSVG(pal, { rainbow: rain })
  $('hanger-name').textContent = state.equippedSkin
    ? getSkinById(state.equippedSkin)?.name || costume().name
    : costume().name

  for (const item of ROOM_ITEMS) {
    document.querySelectorAll(`[data-deco="${item.id}"]`).forEach((el) => {
      el.classList.toggle('on', hasItem(item.id))
    })
  }

  $('hot-tv').classList.toggle('locked', !hasItem('tv'))
  updateTvBadge()

  const chartObj = $('chart-obj')
  if (chartObj) chartObj.classList.toggle('upgraded', hasItem('laptop'))

  $('wall-frames').innerHTML = state.hangingPhotos
    .map((id, i) => {
      const p = PHOTOS.find((x) => x.id === id)
      if (!p) {
        return `<div class="frame empty" data-slot="${i}" aria-hidden="true">+</div>`
      }
      return `<div class="frame filled" data-slot="${i}" aria-label="${p.name}"><span>${p.emoji}</span></div>`
    })
    .join('')

  $('cam-level-pip').textContent = `ур. ${state.cameraLevel}`
  $('costume-level-pip').textContent = `ур. ${state.costumeLevel}`
  $('passive-level-pip').textContent = `ур. ${state.passiveLevel}`

  requestAnimationFrame(() => requestAnimationFrame(fitIsoRoom))
}

export function fitIsoRoom() {
  const room = $('room')
  const iso = room?.querySelector('.room-3d')
  if (!room || !iso) return
  const w = room.clientWidth
  const h = room.clientHeight
  if (w < 40 || h < 40) return

  iso.style.setProperty('--iso-scale', '1')
  iso.style.setProperty('--iso-x', '0px')
  iso.style.setProperty('--iso-y', '0px')
  void iso.offsetWidth

  const union = (root) => {
    const faces = root.querySelectorAll('.face-floor, .face-left, .face-back, .prop')
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    faces.forEach((f) => {
      if (f.matches('.fridge:not(.on), .plant:not(.on)')) return
      const r = f.getBoundingClientRect()
      minX = Math.min(minX, r.left)
      minY = Math.min(minY, r.top)
      maxX = Math.max(maxX, r.right)
      maxY = Math.max(maxY, r.bottom)
    })
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
  }

  const box = union(iso)
  const scale = Math.min((w * 0.92) / Math.max(box.w, 1), (h * 0.86) / Math.max(box.h, 1), 1.45)
  iso.style.setProperty('--iso-scale', String(Math.max(0.55, Math.round(scale * 1000) / 1000)))
  void iso.offsetWidth

  const fitted = union(iso)
  const roomBox = room.getBoundingClientRect()
  const dx = roomBox.left + roomBox.width / 2 - (fitted.minX + fitted.maxX) / 2
  const dy = roomBox.top + roomBox.height * 0.54 - (fitted.minY + fitted.maxY) / 2
  iso.style.setProperty('--iso-x', `${Math.round(dx)}px`)
  iso.style.setProperty('--iso-y', `${Math.round(dy)}px`)
}

function openModal(title, html, { wide = false } = {}) {
  $('modal-title').textContent = title
  $('modal-body').innerHTML = html
  $('modal').classList.remove('hidden')
  $('modal-card').classList.toggle('wide', wide)
}

function closeModal() {
  $('modal').classList.add('hidden')
  maybeAutoInterstitial()
}

function buyBtn(cost) {
  const can = state.coins >= cost
  return `<button class="btn ${can ? 'btn-gold' : 'btn-ghost'}" data-cost="${cost}" ${can ? '' : 'disabled'}>${cost} 🪙</button>`
}

function updateTvBadge() {
  const badge = $('tv-badge')
  if (!badge) return
  if (!hasItem('tv')) {
    badge.classList.add('hidden')
    return
  }
  badge.classList.remove('hidden')
  if (canWatchTv()) {
    badge.textContent = '+200'
  } else {
    badge.textContent = formatCountdown(tvCooldownLeft())
  }
}

export function openCostume() {
  const c = costume()
  const next = nextCostumePreview()
  const pal = palette()
  const rain = Boolean(equippedSkinData()?.rainbow)
  const upgrade = `<div class="card-row"><div><div class="card-title">Улучшить до ур. ${next.level}${next.level > 10 ? '' : ` · ${next.name}`}</div><div class="card-sub">Геройство +${Math.round(next.heroBonus * 100)}% · смена ${next.duration}с${next.level > 10 ? ' · вид как на 10 уровне' : ''}</div></div>${buyBtn(nextCostumeCost()).replace('data-cost', 'data-act="up-costume" data-cost')}</div>`

  const skinCards = COIN_SKINS.map((s) => {
    const owned = state.ownedSkins.includes(s.id)
    const on = state.equippedSkin === s.id
    let action
    if (!owned) {
      action = buyBtn(s.cost).replace('data-cost', `data-act="buy-skin" data-id="${s.id}" data-cost`)
    } else if (on) {
      action = `<span class="worn-tag">Надет</span>`
    } else {
      action = `<span class="worn-tag dim">Куплено</span>`
    }
    return `<div class="card-row">${skinThumb(s)}<div class="grow"><div class="card-title">${s.name} ${on ? '• надет' : ''}</div><div class="card-sub">${s.desc}</div></div>${action}</div>`
  }).join('')

  openModal(
    'Костюм',
    `<div class="suit-preview">${spiderSVG(pal, { rainbow: rain, torn: state.costumeLevel === 1 && !state.equippedSkin })}</div>
     <p class="lead">Сейчас: <b>${c.name}</b> (ур. ${c.level}${c.level <= 10 ? '/10' : ''})</p>
     <p class="card-sub">Бонус геройства +${Math.round(c.heroBonus * 100)}% · слотов целей: ${c.slots}</p>
     ${upgrade}
     <h3 class="section-h">Скины за монеты</h3>
     <p class="card-sub">Премиум-костюмы — кнопка «₽» вверху. Купленный костюм надевается сам.</p>
     ${skinCards}`,
    { wide: true },
  )
}

export function openCamera() {
  const cam = camera()
  const next = nextCameraPreview()
  const upgrade = `<div class="card-row"><div><div class="card-title">Улучшить до ур. ${next.level}${next.level > 10 ? '' : ` · ${next.name}`}</div><div class="card-sub">Кадров: ${next.shots} · фото +${Math.round(next.photoBonus * 100)}%${next.level > 10 ? ' · вид как на 10 уровне' : ''}</div></div>${buyBtn(nextCameraCost()).replace('data-cost', 'data-act="up-camera" data-cost')}</div>`

  openModal(
    'Камера',
    `<div class="big-emoji">📷</div>
     <p class="lead">Сейчас: <b>${cam.name}</b> (ур. ${cam.level}${cam.level <= 10 ? '/10' : ''})</p>
     <ul class="feat"><li>Кадров за смену: <b>${cam.shots}</b></li><li>Доход с фото: <b>+${Math.round(cam.photoBonus * 100)}%</b></li><li>Шанс редкого кадра: <b>${Math.round((0.2 + cam.rareBonus) * 100)}%</b></li></ul>
     ${upgrade}`,
  )
}

export function openPassive() {
  const p = passive()
  const next = nextPassivePreview()
  const upgrade = `<div class="card-row"><div><div class="card-title">Улучшить до ур. ${next.level}${next.level > 10 ? '' : ` · ${next.name}`}</div><div class="card-sub">${next.perMin} монет/мин · максимум ${maxPassiveBank(next)} 🪙${next.level > 10 ? ' · без смены оформления' : ''}</div></div>${buyBtn(nextPassiveCost()).replace('data-cost', 'data-act="up-passive" data-cost')}</div>`

  openModal(
    'Пассивный доход',
    `<div class="big-emoji">📈</div>
     <p class="lead">Сейчас: <b>${p.name}</b> (ур. ${p.level}${p.level <= 10 ? '/10' : ''})</p>
     <p class="income-big">+${passivePerMin()} 🪙 / мин</p>
     <p class="card-sub">Даже когда ты не в игре, Человек-паук ведёт блог. Максимум можно накопить: ${maxPassiveBank(p, passivePerMin())} 🪙</p>
     ${upgrade}`,
  )
}

export function openShop() {
  const rows = ROOM_ITEMS.map((it) => {
    const owned = hasItem(it.id)
    return `<div class="card-row"><div class="skin-ico">${it.emoji}</div><div class="grow"><div class="card-title">${it.name}</div><div class="card-sub">${it.desc}</div></div>${
      owned
        ? `<button class="btn btn-ghost" disabled>Есть</button>`
        : buyBtn(it.cost).replace('data-cost', `data-act="buy-item" data-id="${it.id}" data-cost`)
    }</div>`
  }).join('')

  openModal(
    'Магазин комнаты',
    `<p class="card-sub">Предметы остаются навсегда и сразу появляются в комнате. Покупки за рубли — кнопка «₽».</p>${rows}`,
    { wide: true },
  )
}

export function openPremium() {
  const ads = state.adsDisabled
    ? `<div class="card-row"><div class="skin-ico">✅</div><div class="grow"><div class="card-title">Реклама отключена</div><div class="card-sub">Удвоение после смены — бесплатно 1 раз</div></div></div>`
    : `<div class="card-row"><div class="skin-ico">🚫</div><div class="grow"><div class="card-title">${PREMIUM.disableAds.name}</div><div class="card-sub">Убирает рекламу. Удвоение смены — бесплатно.</div></div><button class="btn btn-pink" data-act="buy-noads">${PREMIUM.disableAds.priceRub} ₽</button></div>`

  const skins = PAID_SKINS.map((s) => {
    const owned = state.ownedSkins.includes(s.id)
    const on = state.equippedSkin === s.id
    let action
    if (!owned) {
      action = `<button class="btn btn-pink" data-act="buy-paid" data-id="${s.id}">${s.priceRub} ₽</button>`
    } else if (on) {
      action = `<span class="worn-tag">Надет</span>`
    } else {
      action = `<span class="worn-tag dim">Куплено</span>`
    }
    return `<div class="card-row">${skinThumb(s)}<div class="grow"><div class="card-title">${s.name} ${on ? '• надет' : ''}</div><div class="card-sub">${s.desc}</div></div>${action}</div>`
  }).join('')

  openModal(
    'Покупки за рубли',
    `<p class="card-sub">Реальные покупки в Яндекс Играх. Локально — тестовый режим.</p>
     <h3 class="section-h">Премиум</h3>${ads}
     <h3 class="section-h">Костюмы</h3>${skins}`,
    { wide: true },
  )
}

export function openPhotos() {
  const hanging = state.hangingPhotos.filter(Boolean).length
  const collection = PHOTOS.map((p) => {
    const have = state.ownedPhotos.includes(p.id)
    const hung = state.hangingPhotos.includes(p.id)
    let action = `<span class="card-sub">Ещё не выпал</span>`
    if (have && hung) action = `<button class="btn btn-ghost" data-act="unhang" data-id="${p.id}">Снять</button>`
    else if (have && hanging < 6) action = `<button class="btn btn-red" data-act="hang" data-id="${p.id}">Повесить</button>`
    else if (have) action = `<span class="card-sub">Стена полная</span>`
    return `<div class="card-row"><div class="skin-ico">${have ? p.emoji : '❔'}</div><div class="grow"><div class="card-title">${have ? p.name : 'Неизвестный кадр'}</div><div class="card-sub">${hung ? 'Висит на стене · +5% к фото' : have ? 'В коллекции' : 'Найди на съёмке'}</div></div>${action}</div>`
  }).join('')

  openModal(
    'Стена фото',
    `<p class="lead">Висит кадров: <b>${hanging}/6</b> · бонус к фото <b>+${hangingPhotoBonusPercent()}%</b></p>
     <p class="card-sub">Редкий кадр выпадает после смены фотографа. Повтор → +50 монет.</p>${collection}`,
    { wide: true },
  )
}

export function openAchievements() {
  const rows = ACHIEVEMENTS.map((a) => {
    const done = Boolean(state.achievements[a.id])
    return `<div class="card-row ${done ? '' : 'dim'}"><div class="skin-ico">${done ? a.emoji : '🔒'}</div><div class="grow"><div class="card-title">${a.name}</div><div class="card-sub">${a.desc}</div></div><div class="card-sub">${done ? 'Готово' : `+${a.reward}`}</div></div>`
  }).join('')
  openModal('Достижения', rows, { wide: true })
}

export function openHelp() {
  openModal(
    'Как играть',
    `<ol class="help-list">
      <li>Нажми <b>монитор</b> — снимай фото для газеты.</li>
      <li>Нажми <b>окно</b> — спасай город как Человек-паук.</li>
      <li>Монеты трать на костюм, камеру, блог и вещи.</li>
      <li>Редкие кадры вешай на стену — они дают бонус.</li>
      <li>Костюмы за рубли — отдельная кнопка <b>₽</b> вверху.</li>
      <li>Человек-паук зарабатывает сам, даже когда ты ушёл.</li>
    </ol>
    <p class="card-sub">Энергии нет: играй сколько хочешь!</p>`,
  )
}

function showResult(session) {
  lastShift = session
  doubledThisShift = false
  state.stats.shifts += 1

  let extra = 0
  let rareHtml = ''
  if (session.type === 'photo' && session.rarePhoto) {
    if (session.rareDuplicate) {
      extra = 50
      rareHtml = `<div class="rare-card dup">Повтор кадра «${session.rarePhoto.name}» → +50 🪙</div>`
    } else {
      state.ownedPhotos.push(session.rarePhoto.id)
      rareHtml = `<div class="rare-card">Редкий кадр! ${session.rarePhoto.emoji}<br><b>${session.rarePhoto.name}</b></div>`
      sfx.rare()
    }
  }

  addCoins(session.earned + extra)
  const unlocked = checkAchievements()

  const detail =
    session.type === 'photo'
      ? session.details
          .map((r, i) => {
            const n = { perfect: 'Идеально', medium: 'Нормально', miss: 'Промах' }[r.quality]
            return `<li>${i + 1}. ${n} · +${r.coins}</li>`
          })
          .join('')
      : `<li>Жители: ${session.civilians}</li><li>Преступники: ${session.criminals}</li><li>Суперцели: ${session.supers}</li>`

  $('result-title').textContent = session.type === 'photo' ? 'Смена фотографа' : 'Смена героя'
  $('result-coins').textContent = `+${session.earned + extra}`
  $('result-list').innerHTML = detail
  $('result-rare').innerHTML = rareHtml
  $('result-rare').classList.toggle('hidden', !rareHtml)

  const hangBtn = $('btn-hang-new')
  if (session.type === 'photo' && session.rarePhoto && !session.rareDuplicate) {
    hangBtn.classList.remove('hidden')
    hangBtn.dataset.photo = session.rarePhoto.id
  } else {
    hangBtn.classList.add('hidden')
  }

  const dbl = $('btn-double')
  dbl.textContent = state.adsDisabled ? 'Удвоить бесплатно' : 'Удвоить за рекламу'
  dbl.classList.remove('hidden')

  $('screen-result').classList.remove('hidden')
  renderHud()
  bounceCoins()
  sfx.win()
  enqueueAchievements(unlocked)
}

async function doDouble() {
  if (!lastShift || doubledThisShift) return
  if (!state.adsDisabled) {
    const ok = await showRewarded('double')
    if (!ok) {
      toast('Награда не получена')
      return
    }
  }
  doubledThisShift = true
  const extra = addCoins(lastShift.earned)
  $('result-coins').textContent = `+${lastShift.earned * 2 + (lastShift.rareDuplicate ? 50 : 0)}`
  $('btn-double').classList.add('hidden')
  toast(`Удвоено! +${extra}`)
  afterCoins(checkAchievements())
}

async function closeResult() {
  $('screen-result').classList.add('hidden')
  lastShift = null
  renderRoom()
  renderHud()
  await maybeAutoInterstitial()
}

function overlayOpen() {
  const ids = ['modal', 'screen-result', 'screen-offline', 'ad-overlay', 'tutorial', 'achievement-pop']
  return ids.some((id) => {
    const el = $(id)
    return el && !el.classList.contains('hidden')
  })
}

async function maybeAutoInterstitial() {
  if (!gameStarted || interstitialBusy || state.adsDisabled) return
  if (isMinigameOpen() || overlayOpen()) return
  const now = Date.now()
  if (now - (Number(state.lastInterstitialAt) || 0) < INTERSTITIAL_MS) return
  interstitialBusy = true
  state.lastInterstitialAt = now
  saveState()
  try {
    await showInterstitial()
  } finally {
    interstitialBusy = false
  }
}

function showOffline(amount, minutes) {
  $('offline-coins').textContent = `+${amount}`
  $('offline-min').textContent = minutes === 1 ? 'за 1 минуту' : `за ${minutes} мин. пока тебя не было`
  $('btn-offline-extra').classList.toggle('hidden', state.adsDisabled)
  $('screen-offline').classList.remove('hidden')
  $('screen-offline').dataset.amount = String(amount)
}

async function claimOffline(withAd) {
  const base = Number($('screen-offline').dataset.amount || 0)
  let extra = 0
  if (withAd) {
    const ok = await showRewarded('offline')
    if (!ok) {
      toast('Награда не получена')
      return
    }
    extra = Math.round(base * 0.5)
  }
  addCoins(base + extra)
  $('screen-offline').classList.add('hidden')
  afterCoins(checkAchievements())
  toast(extra ? `Получено ${base + extra} 🪙` : `Получено ${base} 🪙`)
  renderRoom()
  maybeTutorial()
}

function maybeTutorial() {
  if (state.seenTutorial) return
  if (!$('screen-offline').classList.contains('hidden')) return
  $('tutorial').classList.remove('hidden')
}

export function bindUI() {
  if (uiBound) return
  uiBound = true

  document.body.addEventListener('pointerdown', () => unlockAudio(), { once: true })
  const splashHero = $('splash-spider')
  if (splashHero && !splashHero.querySelector('svg')) {
    splashHero.innerHTML = spiderSVG({ body: '#e11d48', accent: '#2563eb', glow: '#fbbf24' })
  }

  $('btn-play').addEventListener('click', () => {
    sfx.tap()
    startFromSplash()
  })
  $('btn-mute').addEventListener('click', () => {
    setMuted(!isMuted())
    sfx.tap()
    renderHud()
  })
  $('btn-help').addEventListener('click', () => {
    sfx.tap()
    openHelp()
  })
  $('btn-premium').addEventListener('click', () => {
    sfx.tap()
    openPremium()
  })

  window.addEventListener('resize', fitIsoRoom)
  if (typeof ResizeObserver !== 'undefined') {
    const room = $('room')
    if (room) new ResizeObserver(fitIsoRoom).observe(room)
  }

  $('room').addEventListener('click', (e) => {
    const hot = e.target.closest('[data-hot]')
    if (!hot) return
    sfx.tap()
    const name = hot.dataset.hot
    if (name === 'photo') startPhotoGame({ onDone: showResult })
    else if (name === 'hero') startHeroGame({ onDone: showResult })
    else if (name === 'costume') openCostume()
    else if (name === 'camera') openCamera()
    else if (name === 'passive') openPassive()
    else if (name === 'shop') openShop()
    else if (name === 'achievements') openAchievements()
    else if (name === 'photos') openPhotos()
    else if (name === 'tv') watchTv()
  })

  $('modal-close').addEventListener('click', () => {
    sfx.tap()
    closeModal()
  })
  $('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal()
  })
  $('modal-body').addEventListener('click', onModalClick)

  $('screen-photo').addEventListener('pointerdown', (e) => {
    if (e.target.closest('#btn-photo-exit')) return
    shootPhoto()
  })
  $('btn-photo-exit').addEventListener('click', () => {
    sfx.tap()
    abortPhoto()
  })
  $('btn-hero-exit').addEventListener('click', () => {
    sfx.tap()
    abortHero()
  })
  $('btn-double').addEventListener('click', () => {
    sfx.tap()
    doDouble()
  })
  $('btn-result-ok').addEventListener('click', () => {
    sfx.tap()
    closeResult()
  })
  $('btn-hang-new').addEventListener('click', () => {
    sfx.tap()
    hangPhoto($('btn-hang-new').dataset.photo)
    $('btn-hang-new').classList.add('hidden')
    toast('Кадр повешен на стену!')
    renderRoom()
  })
  $('btn-offline-take').addEventListener('click', () => {
    sfx.tap()
    claimOffline(false)
  })
  $('btn-offline-extra').addEventListener('click', () => {
    sfx.tap()
    claimOffline(true)
  })
  $('ach-pop-ok').addEventListener('click', () => {
    sfx.tap()
    $('achievement-pop').classList.add('hidden')
    showingAchievement = false
    pumpAchievements()
  })
  $('tut-ok').addEventListener('click', () => {
    sfx.tap()
    state.seenTutorial = true
    saveState()
    $('tutorial').classList.add('hidden')
  })
}

function startPassiveTicker() {
  setInterval(() => {
    if (!gameStarted) return
    updateTvBadge()
    maybeAutoInterstitial()
    if (!$('screen-offline').classList.contains('hidden')) return
    const { coins, minutes } = collectPassiveCoins()
    if (coins > 0 && minutes > 0) {
      addCoins(coins)
      afterCoins(checkAchievements())
      toast(`Блог принёс +${coins} 🪙`)
    }
  }, 10000)

  document.addEventListener('visibilitychange', () => {
    if (!gameStarted) return
    if (document.hidden) {
      touchLastVisit()
    } else {
      const { coins, minutes } = collectPassiveCoins()
      if (coins > 0) showOffline(coins, minutes)
    }
  })
}

function hangPhoto(id) {
  if (!id || state.hangingPhotos.includes(id)) return
  const idx = state.hangingPhotos.findIndex((x) => !x)
  if (idx < 0) {
    toast('На стене нет места')
    return
  }
  state.hangingPhotos[idx] = id
  saveState()
  enqueueAchievements(checkAchievements())
  renderRoom()
}

function unhangPhoto(id) {
  const idx = state.hangingPhotos.indexOf(id)
  if (idx < 0) return
  state.hangingPhotos[idx] = null
  saveState()
  renderRoom()
}

async function watchTv() {
  if (!hasItem('tv')) {
    toast('Сначала купи телевизор в коробке')
    return
  }
  if (!canWatchTv()) {
    toast(`Телевизор отдохнёт ещё ${formatCountdown(tvCooldownLeft())}`)
    return
  }
  if (!state.adsDisabled) {
    const ok = await showRewarded('tv')
    if (!ok) {
      toast('Награда не получена')
      return
    }
  }
  markTvWatched()
  addCoins(200)
  afterCoins(checkAchievements())
  toast('+200 за телевизор!')
  renderRoom()
}

async function onModalClick(e) {
  const btn = e.target.closest('[data-act]')
  if (!btn) return
  const act = btn.dataset.act
  const id = btn.dataset.id

  if (act === 'up-costume') {
    const cost = nextCostumeCost()
    if (cost == null || !spendCoins(cost)) return failBuy()
    state.costumeLevel += 1
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openCostume()
    toast(`Костюм: ${costume().name} · ур. ${costume().level}`)
  } else if (act === 'up-camera') {
    const cost = nextCameraCost()
    if (cost == null || !spendCoins(cost)) return failBuy()
    state.cameraLevel += 1
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openCamera()
    toast(`Камера: ${camera().name} · ур. ${camera().level}`)
  } else if (act === 'up-passive') {
    const cost = nextPassiveCost()
    if (cost == null || !spendCoins(cost)) return failBuy()
    state.passiveLevel += 1
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openPassive()
    toast(`Доход: ${passive().name} · ур. ${passive().level}`)
  } else if (act === 'buy-item') {
    const item = ROOM_ITEMS.find((x) => x.id === id)
    if (!item || hasItem(item.id) || !spendCoins(item.cost)) return failBuy()
    state.roomItems[item.id] = true
    if (item.id === 'laptop' && state.passiveLevel < 10) {
      state.passiveLevel += 1
      toast(`Ноутбук! Пассивный доход → ур. ${state.passiveLevel}`)
    }
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openShop()
  } else if (act === 'buy-skin') {
    const skin = COIN_SKINS.find((x) => x.id === id)
    if (!skin || state.ownedSkins.includes(id) || !spendCoins(skin.cost)) return failBuy()
    state.ownedSkins.push(id)
    state.equippedSkin = id
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openCostume()
    toast(`Скин «${skin.name}» надет`)
  } else if (act === 'buy-paid') {
    const skin = PAID_SKINS.find((x) => x.id === id)
    if (!skin) return
    const ok = await purchaseProduct(skin.productId)
    if (!ok) {
      toast('Покупка отменена')
      return
    }
    if (!state.ownedSkins.includes(id)) state.ownedSkins.push(id)
    state.equippedSkin = id
    saveState()
    sfx.upgrade()
    afterCoins(checkAchievements())
    renderRoom()
    openPremium()
    toast(`Скин «${skin.name}» надет`)
  } else if (act === 'buy-noads') {
    const ok = await purchaseProduct(PREMIUM.disableAds.productId)
    if (!ok) {
      toast('Покупка отменена')
      return
    }
    state.adsDisabled = true
    saveState()
    sfx.upgrade()
    toast('Реклама отключена')
    openPremium()
  } else if (act === 'hang') {
    hangPhoto(id)
    sfx.tap()
    openPhotos()
  } else if (act === 'unhang') {
    unhangPhoto(id)
    sfx.tap()
    openPhotos()
  }
}

function failBuy() {
  sfx.error()
  toast('Не хватает монет')
}

export function startFromSplash() {
  $('screen-splash').classList.add('hidden')
  $('screen-game').classList.remove('hidden')
  renderRoom()
  renderHud()
  gameStarted = true
  unlockAudio()
  playBgm('room')
  gameplayStart()
  startPassiveTicker()

  if (!state.lastInterstitialAt) {
    state.lastInterstitialAt = Date.now()
    saveState()
  }

  const { coins, minutes } = collectPassiveCoins()
  if (coins > 0) showOffline(coins, minutes)
  else maybeTutorial()
}
