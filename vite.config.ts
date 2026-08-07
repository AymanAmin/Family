import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'production' ? '/Family/' : '/',
  build: {
    sourcemap: true,
    target: 'es2022',
  },
}))
