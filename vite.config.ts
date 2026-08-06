import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Base pública del Storage de imágenes (mismo origen/ruta que src/lib/assets.ts).
const SUPABASE_IMAGES = /^https:\/\/kvmzratzzdyjrazkstfw\.supabase\.co\/storage\/v1\/object\/public\/game-images\/.*/i

// Middleware de solo-desarrollo: recibe anomalías de la IA en vivo (turnos vacíos,
// rachas de estancamiento) desde src/state/history/liveDebug.ts y las vuelca a
// ai-debug.log para poder seguirlas con `tail -f` mientras se juega en el navegador.
// `apply: 'serve'` lo excluye de `vite build` — no llega a producción.
function aiDebugPlugin(): Plugin {
  const logPath = resolve(__dirname, 'ai-debug.log')
  return {
    name: 'ai-debug-log',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__ai-debug', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const entry = JSON.parse(body)
            appendFileSync(logPath, `${new Date().toISOString()} ${JSON.stringify(entry)}\n`)
          } catch {
            // Diagnóstico best-effort: un fallo al parsear/escribir no debe romper la partida.
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    aiDebugPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Villainous',
        short_name: 'Villainous',
        theme_color: '#0e0e0e',
        background_color: '#0e0e0e',
        display: 'standalone',
        icons: [
          { src: '/Logo-vote-villainous.webp', sizes: '512x512', type: 'image/webp', purpose: 'any' },
        ],
      },
      workbox: {
        // Imágenes del juego: se sirven desde la caché y NO se vuelven a pedir a Supabase
        // (CacheFirst), sorteando el `no-cache` del CDN free. Son inmutables (nombre = versión).
        runtimeCaching: [
          {
            urlPattern: SUPABASE_IMAGES,
            handler: 'CacheFirst',
            options: {
              cacheName: 'game-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 }, // 60 días
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    allowedHosts: [
      '14a3-85-251-12-34.ngrok-free.app',
      '.ngrok-free.app', // Permite todos los hosts de ngrok
    ],
  },
})
