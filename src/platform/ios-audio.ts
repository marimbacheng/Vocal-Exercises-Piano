// iOS 靜音實體開關會讓 Web Audio 無聲(SPEC 3.4.2,陷阱 #3)。
// 對策:首次使用者手勢時播放一段極短的無聲 <audio playsinline>,
// 藉此設定 iOS 的 audio session category,之後 Web Audio 便不受靜音開關影響。

let unlocked = false;
let silentEl: HTMLAudioElement | null = null;

/** 程式建構一段極短(~0.02s)的無聲 16-bit WAV,回傳 blob URL */
function makeSilentWavUrl(): string {
  const sampleRate = 8000;
  const samples = 160;
  const dataLen = samples * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  writeStr(36, 'data');
  dv.setUint32(40, dataLen, true);
  // 其餘位元組已為 0 = 無聲
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/**
 * 必須在使用者手勢的同步呼叫鏈內執行(不可在 await 之後)。只作用一次。
 * 回傳是否確實建立了元素(供測試斷言)。
 */
export function unlockAudioSession(): boolean {
  if (unlocked) return false;
  unlocked = true;
  const el = document.createElement('audio');
  el.setAttribute('playsinline', '');
  el.setAttribute('webkit-playsinline', '');
  el.preload = 'auto';
  el.src = makeSilentWavUrl();
  el.volume = 0;
  el.style.display = 'none';
  // 附到 DOM:部分 iOS 版本對 detached 媒體元素的 audio session 設定不可靠
  document.body.appendChild(el);
  // 播放失敗(非 iOS、政策阻擋)不影響其餘流程
  void el.play().catch(() => {});
  silentEl = el;
  return true;
}

/** 測試用:重設狀態 */
export function _resetForTest(): void {
  unlocked = false;
  silentEl = null;
}

export function _isUnlocked(): boolean {
  return unlocked && silentEl !== null;
}
