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

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) {
      state = defaultState()
      return state
    }
    const parsed = JSON.parse(raw)
    state = { ...defaultState(), ...parsed }
    state.stats = { ...defaultState().stats, ...(parsed.stats || {}) }
    if (!Array.isArray(state.hangingPhotos) || state.hangingPhotos.length !== 6) {
      state.hangingPhotos = [null, null, null, null, null, null]
    }
    if (!Array.isArray(state.ownedSkins)) state.ownedSkins = []
    if (!Array.isArray(state.ownedPhotos)) state.ownedPhotos = []
    if (!state.roomItems || typeof state.roomItems !== 'object') state.roomItems = {}
    if (!state.achievements || typeof state.achievements !== 'object') state.achievements = {}
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

export function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function canWatchTv() {
  return hasItem('tv') && state.lastTvDate !== todayKey()
}

export function markTvWatched() {
  state.lastTvDate = todayKey()
  saveState()
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
