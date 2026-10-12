import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['@rive-app/canvas-advanced'] },
  server: { port: 5173 },
});
