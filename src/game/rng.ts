/**
 * مولّد عشوائي قابل للحقن.
 *
 * الإنتاج يستخدم `crypto.getRandomValues` — لا `Math.random` في أي قرار يخص الأدوار.
 * الاختبارات تحقن مولّدًا ببذرة ثابتة لتصبح الجولات قابلة لإعادة الإنتاج.
 */

export interface Rng {
  /** عدد عشري في [0, 1) */
  next(): number;
}

export const cryptoRng: Rng = {
  next() {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0]! / 2 ** 32;
  },
};

/** mulberry32 — صغير وسريع وكافٍ للاختبارات. */
export function seededRng(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
    },
  };
}

/** عدد صحيح في [min, max] شاملًا الطرفين. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('لا يمكن الاختيار من قائمة فارغة.');
  return items[randomInt(rng, 0, items.length - 1)]!;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
