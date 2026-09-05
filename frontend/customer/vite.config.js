import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '3001'),
    proxy: {
      // Proxy /api and /ws to the Django backend in development
      // Backend URL comes from VITE_BACKEND_URL environment variable
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: (process.env.VITE_BACKEND_URL || 'http://localhost:8000').replace(
          'http://',
          'ws://'
        ),
        ws: true,
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_BACKEND_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
