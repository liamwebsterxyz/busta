export const HOUR_PX = 56;
export const SNAP_MINUTES = 15;
export const MIN_BLOCK_MINUTES = 15;

export function snapToInterval(minutes: number, interval = SNAP_MINUTES): number {
  return Math.round(minutes / interval) * interval;
}

export function clampMinute(m: number): number {
  return Math.max(0, Math.min(1440 - MIN_BLOCK_MINUTES, m));
}
