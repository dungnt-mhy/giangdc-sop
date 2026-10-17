/// <reference types="vite/client" />

// Khai báo tối thiểu cho process.env trong vite.config.ts (không cần @types/node).
declare const process: { env: Record<string, string | undefined> };
