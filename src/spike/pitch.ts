// SPIKE(丟棄式):音高偵測。純函式、零依賴,正式版會移到 analysis/pitch.ts 並補 Vitest。
// 演算法:時域自相關 + 拋物線內插,搜尋範圍限人聲(約 60–1200 Hz)。

export type PitchResult = {
  freq: number; // Hz
  clarity: number; // 0–1,正規化自相關峰值;越接近 1 越像單一週期音
  rms: number;
};

const MIN_FREQ = 60;
const MAX_FREQ = 1200;
/** 低於此音量視為無聲,不輸出音高 */
const RMS_GATE = 0.01;
/** 週期性不足(雜訊、子音)不輸出音高 */
const CLARITY_GATE = 0.85;

export function computeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

export function detectPitch(buf: Float32Array, sampleRate: number): PitchResult | null {
  const rms = computeRms(buf);
  if (rms < RMS_GATE) return null;

  const n = buf.length;
  const minLag = Math.max(2, Math.floor(sampleRate / MAX_FREQ));
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / MIN_FREQ));

  // 正規化自相關(NSDF 風格):r(lag) = 2Σx[i]x[i+lag] / Σ(x[i]² + x[i+lag]²)
  const r = new Float32Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let acf = 0;
    let energy = 0;
    for (let i = 0; i + lag < n; i++) {
      acf += buf[i] * buf[i + lag];
      energy += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
    }
    r[lag] = energy > 0 ? (2 * acf) / energy : 0;
  }

  // 取「第一個」夠高的峰,而非全域最大——全域最大常落在 2 倍週期,造成低八度誤判
  let globalMax = 0;
  for (let lag = minLag; lag <= maxLag; lag++) globalMax = Math.max(globalMax, r[lag]);
  if (globalMax < CLARITY_GATE) return null;
  const threshold = globalMax * 0.9;

  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (r[lag] >= threshold && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      best = lag;
      break;
    }
  }
  if (best < 0) return null;

  // 拋物線內插,把整數 lag 修正到次取樣精度
  const y1 = r[best - 1];
  const y2 = r[best];
  const y3 = r[best + 1];
  const denom = y1 - 2 * y2 + y3;
  const shift = denom !== 0 ? (0.5 * (y1 - y3)) / denom : 0;
  const period = best + shift;

  return { freq: sampleRate / period, clarity: y2, rms };
}

/** 頻率 → 最近的 MIDI 音 + 偏差 cents(A4 = 440) */
export function freqToNote(freq: number): { midi: number; cents: number } {
  const exact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}
