import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5174'),
    proxy: {
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
    },
  },
})
