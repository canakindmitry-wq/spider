import { defineConfig } from 'vite'

// Базовый путь './' нужен для архива Яндекс Игр: ассеты грузятся относительно index.html.
export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 43124,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 43124,
    strictPort: true,
  },
})
