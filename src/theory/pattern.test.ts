import { describe, it, expect } from 'vitest';
import { parsePatternDsl, patternToDsl, PATTERNS } from './pattern.ts';

describe('parsePatternDsl — 基本解析', () => {
  it('省略 beats 預設 1', () => {
    expect(parsePatternDsl('1 3 5')).toEqual([
      { degree: 1, beats: 1 },
      { degree: 3, beats: 1 },
      { degree: 5, beats: 1 },
    ]);
  });

  it('帶 beats:「8:3」→ {degree:8, beats:3}', () => {
    expect(parsePatternDsl('8:3')).toEqual([{ degree: 8, beats: 3 }]);
  });

  it('小數 beats:「1:0.5」→ beats 0.5', () => {
    expect(parsePatternDsl('1:0.5')).toEqual([{ degree: 1, beats: 0.5 }]);
  });

  it('負數 degree 合法:「-1 1」', () => {
    expect(parsePatternDsl('-1 1')).toEqual([
      { degree: -1, beats: 1 },
      { degree: 1, beats: 1 },
    ]);
  });

  it('degree 0 = 休止符:「0」與「0:0.66666」', () => {
    expect(parsePatternDsl('0')).toEqual([{ degree: 0, beats: 1, rest: true }]);
    expect(parsePatternDsl('8:2 0:0.66666 5:0.66666')).toEqual([
      { degree: 8, beats: 2 },
      { degree: 0, beats: 0.66666, rest: true },
      { degree: 5, beats: 0.66666 },
    ]);
  });

  it('多餘空白容忍(前後與中間)', () => {
    expect(parsePatternDsl('  1   5  1  ')).toEqual([
      { degree: 1, beats: 1 },
      { degree: 5, beats: 1 },
      { degree: 1, beats: 1 },
    ]);
  });
});

describe('parsePatternDsl — 拒絕非法輸入', () => {
  const illegal: Array<[label: string, dsl: string]> = [
    ['空字串', ''],
    ['純空白', '   '],
    ['非整數 degree', '1.5'],
    ['beats = 0', '5:0'],
    ['負 beats', '5:-1'],
    ['亂碼 token', 'abc'],
    ['亂碼 beats', '3:x'],
    ['「-」作分隔符', '1-3-5'],
    ['多重冒號', '1:2:3'],
    ['空 beats', '5:'],
  ];

  it.each(illegal)('%s:「%s」必須 throw', (_label, dsl) => {
    expect(() => parsePatternDsl(dsl)).toThrow();
  });
});

describe('round-trip — 內建音型', () => {
  it('內建音型共 21 個', () => {
    expect(PATTERNS).toHaveLength(21);
  });

  it.each(PATTERNS.map((p) => [p.id, p] as const))(
    '%s:parse → serialize 還原 DSL',
    (_id, pattern) => {
      expect(patternToDsl(pattern.notes)).toBe(pattern.dsl);
    }
  );

  it('帶小數 beats 的 round-trip', () => {
    const dsl = '1 3:1.5 5:0.5 8';
    expect(patternToDsl(parsePatternDsl(dsl))).toBe(dsl);
  });
});
