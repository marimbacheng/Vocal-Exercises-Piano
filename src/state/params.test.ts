import { describe, it, expect } from 'vitest';
import { sanitizeParams, loadParams, saveParams, DEFAULT_PARAMS } from './params.ts';

describe('sanitizeParams — 外部輸入必經驗證', () => {
  it('null / 非物件 → 全預設', () => {
    expect(sanitizeParams(null)).toEqual(DEFAULT_PARAMS);
    expect(sanitizeParams('garbage')).toEqual(DEFAULT_PARAMS);
    expect(sanitizeParams(42)).toEqual(DEFAULT_PARAMS);
  });

  it('合法參數原樣通過', () => {
    const p = { ...DEFAULT_PARAMS, bpm: 60, startRoot: 55, topRoot: 67 };
    expect(sanitizeParams(p)).toEqual(p);
  });

  it('未知 scaleId / patternId → 預設', () => {
    const p = sanitizeParams({ ...DEFAULT_PARAMS, scaleId: 'dorian', patternId: 'nope' });
    expect(p.scaleId).toBe('major');
    expect(p.patternId).toBe('p5-x1');
  });

  it('bpm 超界 → clamp 到二分音符 20–90', () => {
    expect(sanitizeParams({ ...DEFAULT_PARAMS, bpm: 999 }).bpm).toBe(90);
    expect(sanitizeParams({ ...DEFAULT_PARAMS, bpm: 1 }).bpm).toBe(20);
  });

  it('root 超界 → clamp 到 36–84;非數值 → 預設', () => {
    expect(sanitizeParams({ ...DEFAULT_PARAMS, startRoot: 20, topRoot: 90 })).toMatchObject({
      startRoot: 36,
      topRoot: 84,
    });
    expect(sanitizeParams({ ...DEFAULT_PARAMS, startRoot: 'C4' }).startRoot).toBe(60);
  });

  it('topRoot < startRoot → 提到 startRoot(SPEC 2.1 約束)', () => {
    const p = sanitizeParams({ ...DEFAULT_PARAMS, startRoot: 70, topRoot: 60 });
    expect(p.topRoot).toBe(70);
  });

  it('非整數數值 → 四捨五入', () => {
    expect(sanitizeParams({ ...DEFAULT_PARAMS, bpm: 80.6 }).bpm).toBe(81);
  });
});

describe('loadParams / saveParams — storage 故障不 crash', () => {
  function memStorage(init?: Record<string, string>) {
    const map = new Map(Object.entries(init ?? {}));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      dump: () => Object.fromEntries(map),
    };
  }

  it('空 storage → 預設', () => {
    expect(loadParams(memStorage())).toEqual(DEFAULT_PARAMS);
  });

  it('壞 JSON → 預設,不 throw', () => {
    const s = memStorage({ 'vocal-warmup-params-v2': '{oops' });
    expect(loadParams(s)).toEqual(DEFAULT_PARAMS);
  });

  it('save → load round-trip', () => {
    const s = memStorage();
    const p = { ...DEFAULT_PARAMS, bpm: 70, gapBeats: 3 };
    saveParams(s, p);
    expect(loadParams(s)).toEqual(p);
  });

  it('setItem throw(隱私模式)→ 靜默忽略', () => {
    const s = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(() => saveParams(s, DEFAULT_PARAMS)).not.toThrow();
  });
});
