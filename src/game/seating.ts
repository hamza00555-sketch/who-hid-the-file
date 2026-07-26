/**
 * ترتيب الجلوس والجيران.
 *
 * التعريف الوحيد في المشروع: المقاعد مرقّمة 0..n-1 **باتجاه عقارب الساعة**
 * حول الطاولة كما تُرى من الأعلى، واللاعبون يواجهون المركز.
 *
 * من ذلك: التالي مع عقارب الساعة يجلس عن **يسارك**، والسابق عن **يمينك**.
 * (تخيّل ساعة: من يجلس عند 12 ووجهه للمركز، من عند 3 يقع على يساره.)
 */

import type { PlayerPublic } from './types';

export interface Neighbours {
  right: string;
  left: string;
}

/** يرتب اللاعبين حسب المقعد تصاعديًا. */
export function seatedOrder(players: PlayerPublic[]): PlayerPublic[] {
  return [...players].sort((a, b) => a.seat - b.seat);
}

/** جارا اللاعب. يرمي خطأ إذا لم يكن اللاعب في القائمة أو كان عدد اللاعبين أقل من 2. */
export function neighboursOf(playerId: string, players: PlayerPublic[]): Neighbours {
  const order = seatedOrder(players);
  if (order.length < 2) throw new Error('لا يمكن حساب الجيران بأقل من لاعبين اثنين.');
  const index = order.findIndex((p) => p.id === playerId);
  if (index === -1) throw new Error(`اللاعب ${playerId} غير موجود في ترتيب الجلوس.`);
  const n = order.length;
  return {
    left: order[(index + 1) % n]!.id,
    right: order[(index - 1 + n) % n]!.id,
  };
}

/**
 * يعيد ترتيب المقاعد بعد سحب لاعب من موضع إلى آخر (السحب والإفلات عند المضيف).
 * يعيد خريطة `{ playerId: seat }` جاهزة للكتابة.
 */
export function reorderSeats(
  players: PlayerPublic[],
  fromSeat: number,
  toSeat: number,
): Record<string, number> {
  const order = seatedOrder(players);
  if (fromSeat < 0 || fromSeat >= order.length || toSeat < 0 || toSeat >= order.length) {
    throw new Error('موضع مقعد خارج النطاق.');
  }
  const moved = order.splice(fromSeat, 1)[0]!;
  order.splice(toSeat, 0, moved);
  return Object.fromEntries(order.map((p, index) => [p.id, index]));
}

/** يعيد ترقيم المقاعد 0..n-1 بلا فجوات — يُستدعى بعد خروج لاعب. */
export function normalizeSeats(players: PlayerPublic[]): Record<string, number> {
  return Object.fromEntries(seatedOrder(players).map((p, index) => [p.id, index]));
}
