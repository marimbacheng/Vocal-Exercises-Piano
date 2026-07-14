import { describe, it, expect } from 'vitest';
import { degreeToSemitone, degreeToMidi } from './degree.ts';
import { SCALES } from './scale.ts';

const major = SCALES.find((s) => s.id === 'major')!;
const naturalMinor = SCALES.find((s) => s.id === 'natural-minor')!;

describe('degreeToSemitone — SPEC 1.3 驗收表(major,一項不少)', () => {
  const cases: Array<[degree: number, semitone: number]> = [
    [1, 0],
    [5, 7],
    [8, 12],
    [10, 16],
    [12, 19],
    [7, 11],
    [0, -1],
    [-1, -3],
  ];

  it.each(cases)('degree %i → %i 半音', (d, expected) => {
    expect(degreeToSemitone(d, major)).toBe(expected);
  });
});

describe('degreeToSemitone — 負數取模邊界', () => {
  // 這些 degree 讓 (d - 1) % 7 落在 JS 負餘數區,是陷阱 #2 的直接打點
  it('degree -6 → 低八度第 1 級 = -12', () => {
    expect(degreeToSemitone(-6, major)).toBe(-12);
  });
  it('degree -7 → 更低八度第 7 級 = -13', () => {
    expect(degreeToSemitone(-7, major)).toBe(-13);
  });
  it('degree -13 → 低兩個八度第 1 級 = -24', () => {
    expect(degreeToSemitone(-13, major)).toBe(-24);
  });
  it('degree 15 → 高兩個八度第 1 級 = 24', () => {
    expect(degreeToSemitone(15, major)).toBe(24);
  });
});

describe('degreeToSemitone — 非 major scale', () => {
  it('自然小調 degree 3 → 3 半音(小三度)', () => {
    expect(degreeToSemitone(3, naturalMinor)).toBe(3);
  });
  it('自然小調 degree 0(低八度第 7 級)→ -2', () => {
    expect(degreeToSemitone(0, naturalMinor)).toBe(-2);
  });
});

describe('degreeToMidi', () => {
  it('root=60 (C4), degree 8 → 72 (C5)', () => {
    expect(degreeToMidi(8, 60, major)).toBe(72);
  });
  it('root=60 (C4), degree -1 → 57 (A3)', () => {
    expect(degreeToMidi(-1, 60, major)).toBe(57);
  });
});
