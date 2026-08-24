/**
 * Состояние игрока, сохранение и формулы дохода.
 */

import {
  SAVE_KEY,
  COSTUME_LEVELS,
  CAMERA_LEVELS,
  PASSIVE_LEVELS,
  ROOM_ITEMS,
  ACHIEVEMENTS,
  getSkinById,
} from './data.js'

export function defaultState() {
  return {
    coins: 0,
    totalEarned: 0,
    maxCoins: 0,
    costumeLevel: 1,
    cameraLevel: 1,
    passiveLevel: 1,
    equippedSkin: null,
    ownedSkins: [],
    roomItems: {},
    hangingPhotos: [null, null, null, null, null, null],
    ownedPhotos: [],
    achievements: {},
    adsDisabled: false,
    lastVisit: Date.now(),
    lastTvDate: '',
    lastTvAt: 0,
    lastInterstitialAt: 0,
    stats: {
      perfectShots: 0,
      civiliansSaved: 0,
      criminalsCaught: 0,
      shifts: 0,
    },
    seenTutorial: false,
  }
}

export let state = defaultState()

let persistHook = null

/** Облачное сохранение Яндекс Игр (Player.setData). */
export function setPersistHook(fn) {
  persistHook = fn
}

function normalizeState(parsed) {
  const next = { ...defaultState(), ...parsed }
  next.stats = { ...defaultState().stats, ...(parsed.stats || {}) }
  if (!Array.isArray(next.hangingPhotos) || next.hangingPhotos.length !== 6) {
    next.hangingPhotos = [null, null, null, null, null, null]
  }
  if (!Array.isArray(next.ownedSkins)) next.ownedSkins = []
  if (!Array.isArray(next.ownedPhotos)) next.ownedPhotos = []
  if (!next.roomItems || typeof next.roomItems !== 'object') next.roomItems = {}
  if (!next.achievements || typeof next.achievements !== 'object') next.achievements = {}
  if (next.lastTvAt == null) {
    next.lastTvAt = next.lastTvDate && next.lastTvDate === todayKey() ? Date.now() : 0
  }
  return next
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) {
      state = defaultState()
      return state
    }
    const parsed = JSON.parse(raw)
    state = normalizeState(parsed)
  } catch {
    state = defaultState()
  }
  return state
}

export function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota */
  }
  persistHook?.(state)
}

/**
 * Сливаем облачный прогресс: берём сейв с большим totalEarned,
 * плюс объединяем покупки (скины / отключение рекламы).
 */
export function applyRemoteSave(remote) {
  if (!remote || typeof remote !== 'object') return false
  const cloud = normalizeState(remote)
  const remoteEarned = Number(cloud.totalEarned) || 0
  const localEarned = Number(state.totalEarned) || 0

  if (remoteEarned > localEarned) {
    const ads = state.adsDisabled || cloud.adsDisabled
    const skins = [...new Set([...state.ownedSkins, ...cloud.ownedSkins])]
    const photos = [...new Set([...state.ownedPhotos, ...cloud.ownedPhotos])]
    state = cloud
    state.adsDisabled = ads
    state.ownedSkins = skins
    state.ownedPhotos = photos
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
    return true
  }

  let changed = false
  if (cloud.adsDisabled && !state.adsDisabled) {
    state.adsDisabled = true
    changed = true
  }
  for (const id of cloud.ownedSkins) {
    if (!state.ownedSkins.includes(id)) {
      state.ownedSkins.push(id)
      changed = true
    }
  }
  for (const id of cloud.ownedPhotos) {
    if (!state.ownedPhotos.includes(id)) {
      state.ownedPhotos.push(id)
      changed = true
    }
  }
  if (changed) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }
  return changed
}

export function costume() {
  return COSTUME_LEVELS[state.costumeLevel]
}

export function camera() {
  return CAMERA_LEVELS[state.cameraLevel]
}

export function passive() {
  return PASSIVE_LEVELS[state.passiveLevel]
}

export function equippedSkinData() {
  return state.equippedSkin ? getSkinById(state.equippedSkin) : null
}

export function hasItem(id) {
  return Boolean(state.roomItems[id])
}

/** Множители: all / photo / hero / passive / spawn / contrast / space / rainbow */
export function bonuses() {
  const skin = equippedSkinData()
  const hanging = state.hangingPhotos.filter(Boolean).length
  const all =
    1 +
    (hasItem('bed') ? 0.05 : 0) +
    (hasItem('lamp') ? 0.02 : 0) +
    (hasItem('fridge') ? 0.05 : 0) +
    (skin?.all || 0)

  const photo =
    (1 + camera().photoBonus) *
    (1 + hanging * 0.05) *
    (1 + (hasItem('poster') ? 0.03 : 0)) *
    (1 + (hasItem('plant') ? 0.02 : 0)) *
    (1 + (skin?.photo || 0)) *
    all

  const hero =
    (1 + costume().heroBonus) *
    (1 + (hasItem('carpet') ? 0.03 : 0)) *
    (1 + (hasItem('plant') ? 0.02 : 0)) *
    (1 + (skin?.hero || 0)) *
    all

  const pass =
    (1 + (hasItem('shelf') ? 0.05 : 0)) * all

  const spawn = (costume().spawnBonus || 0) + (skin?.spawn || 0)

  return {
    all,
    photo,
    hero,
    pass,
    spawn,
    contrast: Boolean(skin?.contrast),
    spaceBg: Boolean(costume().spaceBg || skin?.spaceBg),
    rainbow: Boolean(skin?.rainbow),
    hanging,
    skin,
  }
}

export function photoIncome(base) {
  return Math.max(1, Math.round(base * bonuses().photo))
}

export function heroIncome(base) {
  return Math.max(1, Math.round(base * bonuses().hero))
}

export function passivePerMin() {
  return Math.max(1, Math.round(passive().perMin * bonuses().pass))
}

export function addCoins(amount, { countAsEarned = true } = {}) {
  const n = Math.round(amount)
  if (n === 0) return 0
  state.coins += n
  if (n > 0 && countAsEarned) state.totalEarned += n
  state.maxCoins = Math.max(state.maxCoins, state.coins)
  saveState()
  return n
}

export function spendCoins(amount) {
  const n = Math.round(amount)
  if (state.coins < n) return false
  state.coins -= n
  saveState()
  return true
}

/** Офлайн-начисление: полные минуты с lastVisit, с капом по уровню. */
export function collectPassiveCoins() {
  const now = Date.now()
  const maxMs = passive().maxHours * 3600 * 1000
  const elapsed = Math.max(0, Math.min(now - state.lastVisit, maxMs))
  const minutes = Math.floor(elapsed / 60000)
  if (minutes <= 0) {
    return { coins: 0, minutes: 0 }
  }
  const coins = minutes * passivePerMin()
  state.lastVisit += minutes * 60000
  saveState()
  return { coins, minutes }
}

export function touchLastVisit() {
  state.lastVisit = Date.now()
  saveState()
}

export const TV_COOLDOWN_MS = 7 * 60 * 1000
export const TV_REWARD = 200

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function tvCooldownLeft() {
  return Math.max(0, (Number(state.lastTvAt) || 0) + TV_COOLDOWN_MS - Date.now())
}

export function canWatchTv() {
  return hasItem('tv') && tvCooldownLeft() === 0
}

export function markTvWatched() {
  state.lastTvAt = Date.now()
  saveState()
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function maxPassiveBank(levelObj = passive(), perMin = null) {
  const rate = perMin ?? levelObj.perMin
  return Math.round(rate * levelObj.maxHours * 60)
}

export function nextCostumeCost() {
  const next = COSTUME_LEVELS[state.costumeLevel + 1]
  return next ? next.cost : null
}

export function nextCameraCost() {
  const next = CAMERA_LEVELS[state.cameraLevel + 1]
  return next ? next.cost : null
}

export function nextPassiveCost() {
  const next = PASSIVE_LEVELS[state.passiveLevel + 1]
  return next ? next.cost : null
}

export function checkAchievements() {
  const unlocked = []
  const tryUnlock = (id, cond) => {
    if (state.achievements[id]) return
    if (!cond) return
    const def = ACHIEVEMENTS.find((a) => a.id === id)
    if (!def) return
    state.achievements[id] = true
    addCoins(def.reward)
    unlocked.push(def)
  }

  tryUnlock('first_earn', state.totalEarned >= 10)
  tryUnlock('photo_master', state.stats.perfectShots >= 10)
  tryUnlock('savior', state.stats.civiliansSaved >= 50)
  tryUnlock('hunter', state.stats.criminalsCaught >= 50)
  tryUnlock('collector', state.hangingPhotos.filter(Boolean).length >= 3)
  tryUnlock('millionaire', state.maxCoins >= 5000)
  tryUnlock('dresser', state.ownedSkins.length >= 1)
  tryUnlock('passive_5', state.passiveLevel >= 5)
  tryUnlock('finance_genius', state.passiveLevel >= 10)

  if (unlocked.length) saveState()
  return unlocked
}

export function hangingPhotoBonusPercent() {
  return state.hangingPhotos.filter(Boolean).length * 5
}

export function itemDef(id) {
  return ROOM_ITEMS.find((i) => i.id === id)
}

export function palette() {
  const skin = equippedSkinData()
  if (skin) return skin.colors
  return costume().colors
}
