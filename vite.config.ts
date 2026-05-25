import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: site served from /CozyCrossStitch/
export default defineConfig({
  base: '/CozyCrossStitch/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
});
