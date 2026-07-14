import type { Scale } from './scale.ts';

/**
 * 將複合級數轉換為相對 root 的半音數。
 * d = 1..7  → 基準八度
 * d = 8     → 高八度的第 1 級 (root + 12)
 * d = 9..14 → 高八度的第 2..7 級
 * d = 0     → 低八度的第 7 級
 * d = -1    → 低八度的第 6 級
 */
export function degreeToSemitone(d: number, scale: Scale): number {
  const octaveOffset = Math.floor((d - 1) / 7);
  // JS 對負數取模會回負值(-1 % 7 === -1),必須先加模數再取一次
  const degreeInScale = (((d - 1) % 7) + 7) % 7;
  return scale.intervals[degreeInScale] + 12 * octaveOffset;
}

export function degreeToMidi(d: number, root: number, scale: Scale): number {
  return root + degreeToSemitone(d, scale);
}
