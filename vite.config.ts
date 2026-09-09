import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // PORT is honoured when the environment sets one, so a second session can bring up its own dev
  // server for verification without taking the port another session is already serving on. An
  // explicit `--port` on the command line still wins over this.
  server: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 120_000,
  },
} as never)
