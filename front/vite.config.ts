import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // lcov es el formato que lee SonarQube (ver sonar-project.properties en la raíz).
    coverage: {
      provider: 'v8',
      // projectRoot '..': rutas relativas a la raíz del repo (front/src/...), que es desde donde corre Sonar.
      reporter: ['text', ['lcov', { projectRoot: '..' }]],
      include: ['src/**/*.{ts,tsx}'],
    },
  },
});
