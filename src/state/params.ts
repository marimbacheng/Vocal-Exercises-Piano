import { SCALES } from '../theory/scale.ts';
import { PATTERNS } from '../theory/pattern.ts';

/** 使用者參數(SPEC 2.1) */
export type AppParams = {
  scaleId: string;
  patternId: string;
  startRoot: number; // MIDI 36–84
  topRoot: number; // MIDI 36–84,>= startRoot
  bpm: number; // 二分音符 BPM 80–200(四分音符為其兩倍)
  gapBeats: number; // 1–4
};

export const PARAM_LIMITS = {
  root: { min: 36, max: 84 },
  bpm: { min: 80, max: 200 }, // 二分音符 BPM;實際四分音符 = 兩倍(160–400)
  gapBeats: { min: 1, max: 4 },
} as const;

export const DEFAULT_PARAMS: AppParams = {
  scaleId: 'major',
  patternId: 'p5-x1',
  startRoot: 60, // C4
  topRoot: 72, // C5
  bpm: 80, // 二分音符 80 = 四分音符 160
  gapBeats: 2,
};

// v2:速度單位由四分音符改為二分音符,舊值語意不同,換 key 讓舊設定重置
const STORAGE_KEY = 'vocal-warmup-params-v2';

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * 外部資料(localStorage)必經驗證:逐欄位 fallback 到預設值、
 * 數值 clamp 到範圍、強制 topRoot >= startRoot。任何垃圾輸入都不 crash。
 */
export function sanitizeParams(raw: unknown): AppParams {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const scaleId = SCALES.some((s) => s.id === r.scaleId)
    ? (r.scaleId as string)
    : DEFAULT_PARAMS.scaleId;
  const patternId = PATTERNS.some((p) => p.id === r.patternId)
    ? (r.patternId as string)
    : DEFAULT_PARAMS.patternId;
  const startRoot = clampInt(r.startRoot, PARAM_LIMITS.root.min, PARAM_LIMITS.root.max, DEFAULT_PARAMS.startRoot);
  let topRoot = clampInt(r.topRoot, PARAM_LIMITS.root.min, PARAM_LIMITS.root.max, DEFAULT_PARAMS.topRoot);
  if (topRoot < startRoot) topRoot = startRoot;
  return {
    scaleId,
    patternId,
    startRoot,
    topRoot,
    bpm: clampInt(r.bpm, PARAM_LIMITS.bpm.min, PARAM_LIMITS.bpm.max, DEFAULT_PARAMS.bpm),
    gapBeats: clampInt(r.gapBeats, PARAM_LIMITS.gapBeats.min, PARAM_LIMITS.gapBeats.max, DEFAULT_PARAMS.gapBeats),
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadParams(storage: StorageLike): AppParams {
  try {
    const json = storage.getItem(STORAGE_KEY);
    if (!json) return { ...DEFAULT_PARAMS };
    return sanitizeParams(JSON.parse(json));
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

export function saveParams(storage: StorageLike, params: AppParams): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(params));
  } catch {
    // 隱私模式等寫入失敗:靜默忽略,參數只活在記憶體
  }
}
