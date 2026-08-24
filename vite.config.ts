import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: { host: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
} as never)
