import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Base pública del Storage de imágenes (mismo origen/ruta que src/lib/assets.ts).
const SUPABASE_IMAGES = /^https:\/\/kvmzratzzdyjrazkstfw\.supabase\.co\/storage\/v1\/object\/public\/game-images\/.*/i

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
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
