/// <reference types="vitest/config" />
/**
 * إعداد الاختبارات الحيّة وحدها: تحتاج شبكة ومشروع Firebase حقيقيًا وتكتب فيه،
 * فلا مكان لها في `npm test`. تُشغَّل عبر `npm run test:live`.
 */
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/net/__tests__/live/**/*.test.ts'],
    testTimeout: 90000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
