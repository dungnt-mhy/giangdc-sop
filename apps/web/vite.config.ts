import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages phục vụ app từ subpath /giangdc-sop/ nên asset phải dùng base tương đối.
  base: '/giangdc-sop/',
  build: { outDir: 'dist' },
});
