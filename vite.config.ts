import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173, host: true,
    // local dev: PostgREST stands in for Supabase's REST API
    proxy: { '/rest/v1': { target: 'http://localhost:3001', changeOrigin: true, rewrite: (p) => p.replace(/^\/rest\/v1/, '') } },
  },
})
