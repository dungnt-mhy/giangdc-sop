import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Base path cấu hình qua biến môi trường: GitHub Pages cần /giangdc-sop/,
  // Cloudflare Pages (domain riêng) dùng /.
  base: process.env.VITE_BASE_PATH ?? '/',
  build: { outDir: 'dist' },
});
