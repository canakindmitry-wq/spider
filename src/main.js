import '@fontsource/nunito/800.css'
import '@fontsource/nunito/900.css'
import './style.css'
import { initYandex } from './yandex.js'
import { loadState, saveState } from './state.js'
import { loadMute } from './audio.js'
import { bindUI, renderHud, renderRoom } from './ui.js'

async function boot() {
  loadMute()
  loadState()
  bindUI()
  await initYandex()
  renderHud()
  renderRoom()
  saveState()
}

boot()
