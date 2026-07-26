import type { PlayerPublic, WakeSlot } from '../types';

export function makePlayers(count: number): PlayerPublic[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index + 1}`,
    name: `لاعب ${index + 1}`,
    avatarId: `char${index + 1}`,
    seat: index,
    ready: true,
    connected: true,
    lastSeen: 0,
    joinedAt: index,
    isHost: index === 0,
  }));
}

export function ids(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `p${index + 1}`);
}

export function dice(map: Record<string, number[]>): Record<string, WakeSlot[]> {
  return Object.fromEntries(
    Object.entries(map).map(([id, values]) => [id, values as WakeSlot[]]),
  );
}
