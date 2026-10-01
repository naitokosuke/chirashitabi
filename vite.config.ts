import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // later: proxy /api to `wrangler dev` so the WebSocket room works locally
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
})
