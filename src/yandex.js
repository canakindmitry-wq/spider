/**
 * Обёртка Яндекс Игр SDK.
 *
 * В каталоге (архив на сервере Яндекса) SDK подключается относительным путём /sdk.js.
 * На своём домене — с https://sdk.games.s3.yandex.net/sdk.js.
 * Локально SDK не грузим: он сыплет ошибками postMessage без родителя Яндекса.
 *
 * Здесь же: облачные сохранения Player.setData, восстановление покупок, таблица лидеров.
 */

import { PREMIUM, PAID_SKINS } from './data.js'
import { state, saveState, applyRemoteSave, setPersistHook } from './state.js'

export const LEADERBOARD_ID = 'coins'

let ysdk = null
let payments = null
let player = null
let lbApi = null
let ready = false
let cloudTimer = 0

export function hasSdk() {
  return Boolean(ysdk)
}

export function adsRemovedFromSdk() {
  return false
}

function inIframe() {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

function shouldLoadSdk() {
  if (inIframe()) return true
  return /yandex\.(ru|net)|yango/i.test(location.host)
}

function sdkUrls() {
  const urls = []
  if (/yandex|yango/i.test(location.host) || inIframe()) {
    urls.push('/sdk.js')
    urls.push('https://sdk.games.s3.yandex.net/sdk.js')
  }
  return urls
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('sdk script'))
    document.head.appendChild(s)
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Полноэкранная заглушка «рекламы» для локальной игры. */
function showFakeAd(title = 'Реклама') {
  return new Promise((resolve) => {
    const el = document.getElementById('ad-overlay')
    const text = document.getElementById('ad-text')
    const skip = document.getElementById('ad-skip')
    if (!el) {
      resolve(true)
      return
    }
    el.classList.remove('hidden')
    let left = 3
    text.textContent = `${title}… ${left}`
    skip.disabled = true
    skip.textContent = 'Подождите'
    const t = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(t)
        text.textContent = 'Готово!'
        skip.disabled = false
        skip.textContent = 'Продолжить'
      } else {
        text.textContent = `${title}… ${left}`
      }
    }, 1000)
    const done = (ok) => {
      skip.onclick = null
      el.classList.add('hidden')
      resolve(ok)
    }
    skip.onclick = () => {
      if (skip.disabled) return
      done(true)
    }
  })
}

function grantProduct(productId) {
  if (!productId) return false
  if (productId === PREMIUM.disableAds.productId) {
    state.adsDisabled = true
    return true
  }
  const skin = PAID_SKINS.find((s) => s.productId === productId)
  if (skin && !state.ownedSkins.includes(skin.id)) {
    state.ownedSkins.push(skin.id)
    return true
  }
  return false
}

function productIdOf(purchase) {
  return purchase?.productID || purchase?.productId || purchase?.id || ''
}

async function pushCloud(flush) {
  if (!player?.setData) return
  try {
    await player.setData({ save: state }, Boolean(flush))
  } catch {
    /* лимит / гость */
  }
}

function scheduleCloudSave() {
  clearTimeout(cloudTimer)
  cloudTimer = setTimeout(() => {
    pushCloud(false)
    submitLeaderboard()
  }, 1200)
}

export async function submitLeaderboard() {
  if (!ysdk) return
  const score = Math.floor(state.totalEarned || 0)
  if (score <= 0) return
  try {
    if (!lbApi) {
      lbApi = await ysdk.getLeaderboards()
    }
    await lbApi.setLeaderboardScore(LEADERBOARD_ID, score)
  } catch {
    /* таблица может быть не создана в консоли */
  }
}

export async function initYandex() {
  if (!shouldLoadSdk()) {
    ready = true
    return null
  }

  const urls = sdkUrls()
  let loaded = false
  for (const url of urls) {
    try {
      await loadScript(url)
      if (window.YaGames) {
        loaded = true
        break
      }
    } catch {
      /* пробуем следующий адрес */
    }
  }
  if (!loaded || typeof window.YaGames === 'undefined') {
    ready = true
    return null
  }

  try {
    ysdk = await window.YaGames.init()
  } catch {
    ysdk = null
    ready = true
    return null
  }

  try {
    payments = await ysdk.getPayments()
  } catch {
    try {
      payments = await ysdk.getPayments({ signed: false })
    } catch {
      payments = null
    }
  }

  try {
    player = await ysdk.getPlayer()
    const remote = await player.getData()
    if (remote?.save) applyRemoteSave(remote.save)
  } catch {
    player = null
  }

  await restorePurchases()
  setPersistHook(() => scheduleCloudSave())

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(cloudTimer)
      pushCloud(true)
      gameplayStop()
    } else {
      gameplayStart()
    }
  })

  try {
    ysdk.on?.('game_api_pause', () => gameplayStop())
    ysdk.on?.('game_api_resume', () => gameplayStart())
  } catch {
    /* старый SDK */
  }

  ready = true
  try {
    const p = ysdk.features?.LoadingAPI?.ready()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    /* ignore */
  }

  submitLeaderboard()
  return ysdk
}

export function gameplayStart() {
  try {
    const p = ysdk?.features?.GameplayAPI?.start()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    /* ignore */
  }
}

export function gameplayStop() {
  try {
    const p = ysdk?.features?.GameplayAPI?.stop()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    /* ignore */
  }
}

/** Interstitial между сменами. Не блокирует игру, если не показалась. */
export async function showInterstitial() {
  if (!ysdk) return
  gameplayStop()
  try {
    await new Promise((resolve) => {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => resolve(),
          onError: () => resolve(),
        },
      })
    })
  } catch {
    /* ignore */
  }
  gameplayStart()
}

/**
 * Rewarded. Возвращает true, если награда должна быть выдана.
 */
export async function showRewarded(placement = 'double') {
  if (ysdk) {
    gameplayStop()
    const ok = await new Promise((resolve) => {
      let rewarded = false
      try {
        ysdk.adv.showRewardedVideo({
          callbacks: {
            onOpen: () => {},
            onRewarded: () => {
              rewarded = true
            },
            onClose: () => resolve(rewarded),
            onError: () => resolve(false),
          },
        })
      } catch {
        resolve(false)
      }
    })
    gameplayStart()
    return ok
  }
  const titles = {
    double: 'Реклама: удвоение',
    tv: 'Реклама: телевизор',
    offline: 'Реклама: +50% офлайн',
  }
  return showFakeAd(titles[placement] || 'Реклама')
}

export async function purchaseProduct(productId) {
  if (payments) {
    try {
      let purchase
      try {
        purchase = await payments.purchase({ id: productId })
      } catch {
        purchase = await payments.purchase(productId)
      }
      grantProduct(productIdOf(purchase) || productId)
      saveState()
      return true
    } catch {
      return false
    }
  }
  const item =
    productId === PREMIUM.disableAds.productId
      ? PREMIUM.disableAds
      : PAID_SKINS.find((s) => s.productId === productId)
  const name = item?.name || productId
  const price = item?.priceRub ? `${item.priceRub} ₽` : ''
  const ok = window.confirm(
    `Тестовая покупка (локальный режим)\n\n${name} ${price}\n\nВ Яндекс Играх спишутся реальные деньги. Продолжить как тест?`,
  )
  if (!ok) return false
  await sleep(300)
  return true
}

export async function restorePurchases() {
  if (!payments) return []
  try {
    const list = await payments.getPurchases()
    let changed = false
    for (const p of list || []) {
      if (grantProduct(productIdOf(p))) changed = true
    }
    if (changed) saveState()
    return list || []
  } catch {
    return []
  }
}

export function isReady() {
  return ready
}
