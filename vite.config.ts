import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    allowedHosts: [
      '14a3-85-251-12-34.ngrok-free.app',
      '.ngrok-free.app', // Permite todos los hosts de ngrok
    ],
  },
})
