/**
 * Обёртка Яндекс Игр SDK.
 * Если SDK недоступен (локальный запуск), показываем заглушку рекламы и тестовые покупки.
 */

import { PREMIUM, PAID_SKINS } from './data.js'

let ysdk = null
let payments = null
let ready = false

export function hasSdk() {
  return Boolean(ysdk)
}

export function adsRemovedFromSdk() {
  return false
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

/** SDK нужен только внутри iframe Яндекс Игр. Локально он сыплет ошибками postMessage. */
function shouldLoadSdk() {
  try {
    if (window.self !== window.top) return true
  } catch {
    return true
  }
  return /yandex\.(ru|net)/i.test(location.host)
}

export async function initYandex() {
  if (!shouldLoadSdk()) {
    ready = true
    return null
  }
  try {
    await loadScript('https://yandex.ru/games/sdk/v2')
    if (typeof window.YaGames === 'undefined') throw new Error('no YaGames')
    ysdk = await window.YaGames.init()
    try {
      payments = await ysdk.getPayments({ signed: true })
    } catch {
      payments = null
    }
    ready = true
    try {
      const p = ysdk.features?.LoadingAPI?.ready()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      /* ignore */
    }
    return ysdk
  } catch {
    ysdk = null
    payments = null
    ready = true
    return null
  }
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
}

/**
 * Rewarded. Возвращает true, если награда должна быть выдана.
 */
export async function showRewarded(placement = 'double') {
  if (ysdk) {
    return new Promise((resolve) => {
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
      const purchase = await payments.purchase({ id: productId })
      try {
        await payments.consumePurchase(purchase.purchaseToken)
      } catch {
        /* некоторые продукты не consume */
      }
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
    return list || []
  } catch {
    return []
  }
}

export function isReady() {
  return ready
}
