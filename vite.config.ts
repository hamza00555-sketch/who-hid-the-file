/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
      الاختبارات الحيّة تحتاج شبكة ومشروع Firebase حقيقيًا وتكتب فيه، فلا تُشغَّل
      ضمن `npm test`. مكانها `npm run test:live`.
    */
    exclude: ['**/node_modules/**', '**/__tests__/live/**'],
  },
});
