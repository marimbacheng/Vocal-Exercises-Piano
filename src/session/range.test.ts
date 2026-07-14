import { describe, it, expect } from 'vitest';
import { computeSungRange, checkSungRange } from './range.ts';
import { SCALES } from '../theory/scale.ts';
import { PATTERNS, parsePatternDsl } from '../theory/pattern.ts';

const major = SCALES.find((s) => s.id === 'major')!;

function patternOf(id: string) {
  return PATTERNS.find((p) => p.id === id)!.notes;
}

describe('computeSungRange(SPEC 2.6)', () => {
  it('p5-x1,C4→C5:最高 = C5+7 = G5 (79),最低 = C4 (60)', () => {
    const r = computeSungRange(patternOf('p5-x1'), major, 60, 72);
    expect(r).toEqual({ maxMidi: 79, minMidi: 60 });
  });

  it('oct-hold(頂音 8 度),topRoot=C5 → 最高 C6 (84):陷阱 #7 的實例', () => {
    const r = computeSungRange(patternOf('oct-hold'), major, 60, 72);
    expect(r.maxMidi).toBe(84);
  });

  it('ext-13(最大 degree 12 = +19 半音),topRoot=C5 → 最高 G6 (91)', () => {
    const r = computeSungRange(patternOf('ext-13'), major, 60, 72);
    expect(r.maxMidi).toBe(91);
  });

  it('含負 degree 的 pattern:最低音低於 startRoot', () => {
    const notes = parsePatternDsl('-1 1 5');
    const r = computeSungRange(notes, major, 60, 72);
    expect(r.minMidi).toBe(57); // C4 + (-3) = A3
  });
});

describe('checkSungRange(SPEC 2.5)', () => {
  it('範圍內 → ok,無警告', () => {
    expect(checkSungRange({ maxMidi: 79, minMidi: 60 })).toEqual({ ok: true, problems: [] });
  });

  it('最高音 84 (C6) 恰在邊界 → ok', () => {
    expect(checkSungRange({ maxMidi: 84, minMidi: 36 }).ok).toBe(true);
  });

  it('超出取樣器上限 → 不 ok,有警告', () => {
    const c = checkSungRange({ maxMidi: 91, minMidi: 60 });
    expect(c.ok).toBe(false);
    expect(c.problems.some((p) => p.includes('最高'))).toBe(true);
  });

  it('低於取樣器下限 → 不 ok', () => {
    const c = checkSungRange({ maxMidi: 60, minMidi: 30 });
    expect(c.ok).toBe(false);
    expect(c.problems.some((p) => p.includes('最低'))).toBe(true);
  });

  it('超出 MIDI 0–127 → 不 ok', () => {
    const c = checkSungRange({ maxMidi: 130, minMidi: 60 });
    expect(c.ok).toBe(false);
    expect(c.problems.some((p) => p.includes('MIDI'))).toBe(true);
  });
});
