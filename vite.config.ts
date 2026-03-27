import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Archivo principal de Electron
        entry: 'electron/main.ts',
      },
      preload: {
        // ⚡ Ahora usamos preload.mjs como fuente
        input: path.join(__dirname, 'electron/preload.mjs'),
      },
      // Polyfill del API de Electron/Node para el renderer
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
