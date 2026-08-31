import { defineConfig } from 'vitest/config'

// Unit-Tests der Lernbereich-Engine laufen in einer reinen Node-Umgebung (kein DOM noetig).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
