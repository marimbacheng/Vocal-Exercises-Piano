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

/**
 * 單次取樣載入逾時。行動網路(尤其 Android 弱訊號)會出現「連著但沒吞吐」,
 * fetch 既不報錯也不完成;沒有上限就會讓 UI 永遠停在「載入中…」、開始鍵永久 disabled。
 * 1.2MB / 17 檔,20 秒對 3G 以上綽綽有餘。
 */
const LOAD_TIMEOUT_MS = 20_000;

let sampler: Tone.Sampler | null = null;
let inFlight: Promise<Tone.Sampler> | null = null;

/** 逾時失敗。與一般載入錯誤區分:逾時代表網路已 stall,立刻重試沒有意義。 */
export class SampleLoadTimeoutError extends Error {
  constructor() {
    super('取樣載入逾時,請確認網路連線後再按一次「開始」');
    this.name = 'SampleLoadTimeoutError';
  }
}

/**
 * 建一顆 Sampler 並等「它自己」載完。
 *
 * **禁用 `Tone.loaded()`**(陷阱 #15):那等的是全域 `ToneAudioBuffer.downloads` 陣列,
 * 而把項目移出陣列的程式寫在該下載的 `finally` 裡——請求 stall 就永遠不會被移除。
 * 一旦有一筆卡住,之後每次 `Tone.loaded()` 都會被那筆舊的擋死,連換新 Sampler 也救不回來。
 * 改用實例自己的 onload/onerror,把等待範圍收斂到這一顆。
 */
function createSampler(): Promise<Tone.Sampler> {
  return new Promise<Tone.Sampler>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // onerror 可能每個失敗檔各觸發一次;只有第一個結果算數
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      fn();
    };
    const s = new Tone.Sampler({
      urls: SAMPLE_URLS,
      baseUrl: './samples/', // 相對路徑(陷阱 #4)
      onload: () => settle(() => resolve(s)),
      onerror: (err: Error) => settle(() => {
        s.dispose();
        reject(err);
      }),
    }).toDestination();
    timer = setTimeout(
      () =>
        settle(() => {
          // Tone 用裸 fetch、無 AbortController,dispose 無法中止已送出的請求;
          // 它們會繼續掛著。因為不再依賴全域 Tone.loaded(),這不影響下一次嘗試。
          s.dispose();
          reject(new SampleLoadTimeoutError());
        }),
      LOAD_TIMEOUT_MS,
    );
  });
}

/**
 * 首次呼叫載入取樣;之後回傳同一實例。
 *
 * 失敗時**不留下半成品**——`sampler` 只在成功後才指派。舊版在 await 之前就指派,
 * 載入失敗後下次呼叫會拿到沒載完的 sampler,transport 照跑但完全無聲。
 * 並行呼叫(連點兩下)共用同一個 in-flight promise。
 */
export async function loadSampler(): Promise<Tone.Sampler> {
  if (sampler) return sampler;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      return await createSampler();
    } catch (err) {
      // 逾時 → 網路已 stall,且卡住的請求無法中止,立刻重試只是再空等一輪 → 直接回報。
      // 其他失敗(404 / 解碼錯誤)多屬一次性 → 重試一次再優雅退回。
      if (err instanceof SampleLoadTimeoutError) throw err;
      return await createSampler();
    }
  })();
  try {
    const s = await inFlight;
    sampler = s;
    return s;
  } finally {
    inFlight = null;
  }
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
