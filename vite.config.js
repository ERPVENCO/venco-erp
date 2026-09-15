import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.jpg'],
      manifest: {
        name: 'Ahumados M&Y - Sistema ERP',
        short_name: 'Ahumados M&Y',
        description: 'Sistema de gestión Ahumados M&Y',
        theme_color: '#B22222',
        background_color: '#F4F1ED',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Cachea los assets estáticos (JS, CSS, imágenes) para que cargue rápido y funcione offline-ready
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg}']
      }
    })
  ],
})