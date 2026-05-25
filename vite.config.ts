import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: site served from /xstitch/
export default defineConfig({
  base: '/xstitch/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
});
