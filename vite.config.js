import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const devPort = Number(env.VITE_DEV_PORT) || 5173

  return {
    plugins: [react()],
    // Windows: ba'zi brauzerlar faqat IPv4 (127.0.0.1) ishlatadi; default [::1] bo'lsa ochilmay qoladi.
    // host: true — barcha interfeyslarda tinglaydi; localhost / 127.0.0.1 / LAN IP ishlaydi.
    server: {
      host: true,
      port: devPort,
      strictPort: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
