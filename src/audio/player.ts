import * as Tone from 'tone';

export { SAMPLER_MIN_MIDI, SAMPLER_MAX_MIDI } from './sampler-range.ts';

/** Salamander Grand Piano(CC BY 3.0),每小三度一檔,C2–C6 */
const SAMPLE_URLS: Record<string, string> = {
  C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3',
  C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3',
  C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3',
  C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3',
  C6: 'C6.mp3',
};

let sampler: Tone.Sampler | null = null;

/** 首次呼叫載入取樣;之後回傳同一實例 */
export async function loadSampler(): Promise<Tone.Sampler> {
  if (sampler) return sampler;
  sampler = new Tone.Sampler({
    urls: SAMPLE_URLS,
    baseUrl: './samples/', // 相對路徑(陷阱 #4)
  }).toDestination();
  await Tone.loaded();
  return sampler;
}

/**
 * 必須在使用者手勢的呼叫鏈內執行(SPEC 3.4.1)。
 * 確認 context 真的 running 才允許排程。
 */
export async function ensureAudioRunning(): Promise<void> {
  await Tone.start();
  if (Tone.getContext().state !== 'running') {
    throw new Error(`AudioContext 未能啟動(state=${Tone.getContext().state})`);
  }
}

/**
 * 監聽 AudioContext 狀態變化(SPEC 3.5)。來電 / 切換 app 會使 context
 * 變為 suspended,呼叫端據此進入 paused 而非靜默空跑 transport。
 * 回傳解除監聽的函式。
 */
export function onAudioContextStateChange(cb: (state: AudioContextState) => void): () => void {
  const raw = Tone.getContext().rawContext as unknown as AudioContext;
  const handler = () => cb(raw.state);
  raw.addEventListener('statechange', handler);
  return () => raw.removeEventListener('statechange', handler);
}
