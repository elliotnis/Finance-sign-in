import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const isYouthFinancetopiaBuild = env.VITE_APP_AUDIENCE === 'youth-financetopia'

  return {
    // The challenge is served beneath this path by the public frontend proxy.
    // Keeping its assets under the same prefix prevents them from colliding
    // with the normal sign-up portal's independently built assets.
    base: isYouthFinancetopiaBuild ? '/youth-financetopia/' : '/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
