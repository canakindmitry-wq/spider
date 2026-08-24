import './style.css'
import { initYandex } from './yandex.js'
import { loadState, saveState } from './state.js'
import { loadMute } from './audio.js'
import { bindUI, renderHud, renderRoom } from './ui.js'

async function boot() {
  loadMute()
  loadState()
  bindUI()
  renderHud()
  renderRoom()
  await initYandex()
  saveState()
}

boot()
