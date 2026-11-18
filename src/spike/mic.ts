// SPIKE(丟棄式)第 2 輪:iOS 開麥後鋼琴被壓到聽筒/變小聲,且關麥後不會恢復(第 1 輪結果)。
// 本輪測四種恢復法(由輕到重)+ 藍牙耳機下的偵測準確度。
// 刻意沿用正式的 unlockAudioSession + loadSampler + Tone context,測的是實際上線的音訊組合。
// 驗證完成後整個 src/spike/ 與 spike-mic.html 連同 vite.config 的入口一起刪除。
import * as Tone from 'tone';
import { unlockAudioSession } from '../platform/ios-audio.ts';
import { ensureAudioRunning, loadSampler, onAudioContextStateChange } from '../audio/player.ts';
import { midiToName } from '../theory/note-name.ts';
import { computeRms, detectPitch, freqToNote } from './pitch.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// ---------------- 紀錄(跨重新整理保存:恢復法 D 會 reload) ----------------
const STORE = 'spike-mic-v2';
type Saved = { lines: string[]; answers: Record<string, string> };
function loadSaved(): Saved {
  try {
    const raw = sessionStorage.getItem(STORE);
    if (raw) return JSON.parse(raw) as Saved;
  } catch {
    /* 隱私模式等:不保存也能測 */
  }
  return { lines: [], answers: {} };
}
function save(): void {
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ lines: logLines, answers: collectAnswers() }));
  } catch {
    /* 同上 */
  }
}

const t0 = performance.now();
const logLines: string[] = [];
function render(line: string, warn: boolean): void {
  const el = $('log');
  const row = document.createElement('div');
  row.textContent = line;
  if (warn) row.className = 'warn';
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
}
function log(msg: string, warn = false): void {
  const line = `[${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`;
  logLines.push(line);
  render(line, warn);
  save();
}

// ---------------- Safari Audio Session API(iOS 16.4+;lib.dom 無此型別) ----------------
type AudioSessionLike = {
  type: string;
  state?: string;
  addEventListener?: (type: string, cb: () => void) => void;
};
const audioSession = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
function sessionInfo(): string {
  if (!audioSession) return 'audioSession 不支援';
  return `audioSession type=${audioSession.type}${audioSession.state ? ` state=${audioSession.state}` : ''}`;
}

// ---------------- 環境診斷 ----------------
function rawCtx(): AudioContext {
  return Tone.getContext().rawContext as unknown as AudioContext;
}
function refreshCtx(): void {
  const c = rawCtx();
  const out = (c as AudioContext & { outputLatency?: number }).outputLatency;
  $('r-ctx').textContent =
    `${c.state} · ${c.sampleRate}Hz · base ${(c.baseLatency * 1000).toFixed(1)}ms` +
    (out !== undefined ? ` · out ${(out * 1000).toFixed(1)}ms` : '');
  $('r-session').textContent = sessionInfo();
}

let ctxListenerBound = false;
function bindCtxListener(): void {
  if (ctxListenerBound) return;
  ctxListenerBound = true;
  onAudioContextStateChange((s) => {
    log(`AudioContext state → ${s}`, s !== 'running');
    refreshCtx();
  });
}

/** 記錄當下的預設輸入/輸出裝置。iOS 標籤能辨識耳機,但無法分辨喇叭/聽筒(第 1 輪結果) */
async function logDevices(prefix: string): Promise<void> {
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const pick = (kind: MediaDeviceKind) => {
      const d = devs.find((x) => x.kind === kind && x.deviceId === 'default') ?? devs.find((x) => x.kind === kind);
      return d ? d.label || '(無標籤)' : '(未提供)';
    };
    log(`${prefix}預設輸入:${pick('audioinput')} | 預設輸出:${pick('audiooutput')}`);
  } catch (e) {
    log(`${prefix}列舉裝置失敗:${errText(e)}`);
  }
}

// ---------------- 鋼琴循環 ----------------
const ARPEGGIO = [60, 64, 67, 72]; // C4 E4 G4 C5
let sampler: Tone.Sampler | null = null;
let pianoOn = false;
let loopId: number | null = null;
let arpIdx = 0;
/** 最近兩個鋼琴音(前一顆的殘響也可能被收到) */
const recentPiano: number[] = [];
// 診斷:排程回呼次數。曾用 Tone.Draw 更新畫面,但 Draw 靠 rAF、會丟掉延遲 > 250ms 的回呼——
// rAF 被降頻時(背景窗格實測 2 fps;iPhone 低電量模式 30 fps)鋼琴音追蹤會卡住,回音比例因此失真。
let ticks = 0;
(window as Window & { __spikeDebug?: () => unknown }).__spikeDebug = () => ({
  ticks,
  transport: Tone.getTransport().state,
  ctx: rawCtx().state,
  now: Number(Tone.now().toFixed(2)),
  samplerOnCurrentCtx: sampler ? sampler.context === Tone.getContext() : null,
});

function startLoop(): void {
  const transport = Tone.getTransport();
  transport.bpm.value = 80;
  loopId = transport.scheduleRepeat((time) => {
    const midi = ARPEGGIO[arpIdx++ % ARPEGGIO.length];
    ticks++;
    sampler?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), '8n', time);
    // 直接在排程回呼更新(約比實際發聲早 0.1s 的 lookahead,相對 0.75s 一拍可忽略),不經 Draw
    recentPiano.unshift(midi);
    recentPiano.length = Math.min(recentPiano.length, 2);
    $('r-piano').textContent = midiToName(midi);
  }, '4n');
  transport.start();
  pianoOn = true;
  syncButtons();
}

async function startPiano(): Promise<void> {
  // 與正式 app 相同順序:手勢同步鏈內先 unlock,才能 await(SPEC 3.4.2)
  const created = unlockAudioSession();
  log(`unlockAudioSession(): ${created ? '建立無聲循環 audio' : '已建立過'}`);
  try {
    await ensureAudioRunning();
    bindCtxListener();
    // 恢復法 C 會換成新 context 上的 sampler;loadSampler 的模組快取仍指向舊的,不能再用
    sampler ??= await loadSampler();
  } catch (e) {
    log(`播放失敗:${errText(e)}`, true);
    return;
  }
  refreshCtx();
  startLoop();
  log(`鋼琴循環開始(C4 E4 G4 C5,80 BPM)· ${sessionInfo()}`);
}

function stopPiano(): void {
  const transport = Tone.getTransport();
  if (loopId !== null) transport.clear(loopId);
  loopId = null;
  transport.stop();
  pianoOn = false;
  recentPiano.length = 0;
  $('r-piano').textContent = '—';
  log('鋼琴停止');
  syncButtons();
}

// ---------------- 麥克風 ----------------
let stream: MediaStream | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;
let rafId = 0;
const buf = new Float32Array(2048);

async function startMic(): Promise<void> {
  // 恢復法 A 若把 type 設成 playback,開麥前先還原,否則可能擋住收音
  if (audioSession && audioSession.type === 'playback') {
    audioSession.type = 'auto';
    log(`開麥前把 audioSession.type 還原為 auto · ${sessionInfo()}`);
  }
  const constraints: MediaTrackConstraints = {
    echoCancellation: $<HTMLInputElement>('opt-ec').checked,
    noiseSuppression: $<HTMLInputElement>('opt-ns').checked,
    autoGainControl: $<HTMLInputElement>('opt-agc').checked,
  };
  log(`getUserMedia 請求:${JSON.stringify(constraints)}`);
  try {
    await ensureAudioRunning();
    bindCtxListener();
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    log(`麥克風失敗:${errText(e)}`, true);
    return;
  }
  const track = stream.getAudioTracks()[0];
  log(`麥克風取得:${track.label || '(無標籤)'} · ${sessionInfo()}`);
  // 標籤要在授權後才拿得到,所以放在 getUserMedia 之後
  await logDevices('開麥時 → ');
  log(`track.getSettings():${JSON.stringify(track.getSettings())}`);
  track.addEventListener('ended', () => log('track ended', true));
  track.addEventListener('mute', () => log('track mute(系統暫停收音)', true));
  track.addEventListener('unmute', () => log('track unmute'));

  const ctx = rawCtx();
  source = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = buf.length;
  // 只接到 analyser,不接 destination——否則會把麥克風放出喇叭形成回授
  source.connect(analyser);
  refreshCtx();
  resetEcho();
  loop();
  syncButtons();
}

function stopMic(): void {
  logEchoSegment('關麥時');
  echoHits = 0;
  echoTotal = 0;
  costN = 0;
  validN = 0;
  costSum = 0;
  costMax = 0;
  cancelAnimationFrame(rafId);
  source?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  source = null;
  analyser = null;
  $('r-note').textContent = '—';
  $('r-cents').textContent = '';
  $('r-freq').textContent = '—';
  $<HTMLElement>('r-meter').style.width = '0';
  log(`麥克風關閉(tracks stopped)· ${sessionInfo()}`);
  refreshCtx();
  syncButtons();
}

// ---------------- 恢復法(由輕到重) ----------------

/** A:直接指定音訊類別為播放專用 */
function recoverA(): void {
  if (!audioSession) {
    log('恢復法 A:此瀏覽器不支援 navigator.audioSession', true);
    return;
  }
  const before = sessionInfo();
  try {
    audioSession.type = 'playback';
  } catch (e) {
    log(`恢復法 A 失敗:${errText(e)}`, true);
    return;
  }
  log(`恢復法 A:audioSession.type = 'playback'(${before} → ${sessionInfo()})`);
  refreshCtx();
}

/** B:重播 unlockAudioSession 建立的無聲循環音軌,看能否讓 iOS 重新判定為播放用途 */
function recoverB(): void {
  const el = document.querySelector('audio');
  if (!el) {
    log('恢復法 B:找不到無聲 audio 元素(請先按 ① 播放鋼琴)', true);
    return;
  }
  el.pause();
  // play() 要在手勢同步鏈內呼叫,所以不先 await 任何東西
  el.play().then(
    () => log(`恢復法 B:無聲音軌 pause → play 完成 · ${sessionInfo()}`),
    (e) => log(`恢復法 B 失敗:${errText(e)}`, true)
  );
}

/** C:關掉舊 AudioContext,建新的並重新載入取樣 */
const SAMPLE_URLS: Record<string, string> = {
  C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3', A2: 'A2.mp3',
  C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3', A3: 'A3.mp3',
  C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3',
  C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3', A5: 'A5.mp3',
  C6: 'C6.mp3',
};
function createSampler(): Promise<Tone.Sampler> {
  // 同正式版:用實例 onload/onerror,不用全域 Tone.loaded()(陷阱 #15)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('取樣載入逾時')), 20_000);
    const s = new Tone.Sampler({
      urls: SAMPLE_URLS,
      baseUrl: './samples/',
      onload: () => {
        clearTimeout(timer);
        resolve(s);
      },
      onerror: (e: Error) => {
        clearTimeout(timer);
        reject(e);
      },
    }).toDestination();
  });
}
async function recoverC(): Promise<void> {
  const wasPlaying = pianoOn;
  if (stream) stopMic();
  if (pianoOn) stopPiano();
  sampler?.dispose();
  sampler = null;
  const oldRate = rawCtx().sampleRate;
  // 手勢同步鏈內:換 context 並立刻 resume,之後才 await(否則 iOS 可能不允許啟動)
  Tone.setContext(new Tone.Context(), true);
  ctxListenerBound = false;
  const started = Tone.start();
  try {
    await started;
    bindCtxListener();
    sampler = await createSampler();
  } catch (e) {
    log(`恢復法 C 失敗:${errText(e)}`, true);
    return;
  }
  refreshCtx();
  log(`恢復法 C:已重建 AudioContext(${oldRate}Hz → ${rawCtx().sampleRate}Hz)並重載取樣 · ${sessionInfo()}`);
  if (wasPlaying) {
    startLoop();
    log('恢復法 C:鋼琴循環已在新 context 上重新開始');
  }
}

/** D:重新整理頁面(紀錄與問卷答案存在 sessionStorage,不會遺失) */
function recoverD(): void {
  log('恢復法 D:重新整理頁面(紀錄保留;重新整理後請再按 ① 播放鋼琴)');
  location.reload();
}

// ---------------- 偵測迴圈 ----------------
let frame = 0;
let validN = 0;
let fpsFrames = 0;
let fpsT0 = 0;
let fps = 0;
let costSum = 0;
let costN = 0;
let costMax = 0;
let echoHits = 0;
let echoTotal = 0;

function detectStats(): string {
  return `平均 ${(costSum / Math.max(costN, 1)).toFixed(2)} ms · 最大 ${costMax.toFixed(2)} ms · ` +
    `嘗試 ${costN} / 有效 ${validN} · rAF ${fps.toFixed(0)} fps`;
}

/** 把目前這一段的「收到鋼琴聲」寫進紀錄,讓每種情境各有一筆數字 */
function logEchoSegment(reason: string): void {
  if (costN > 0) log(`偵測統計(${reason}):${detectStats()}`);
  if (echoTotal === 0) return;
  log(`收到鋼琴聲(${reason}):${((echoHits / echoTotal) * 100).toFixed(0)}%(${echoHits}/${echoTotal})`);
}
function resetEcho(): void {
  logEchoSegment('本段結束,已重算');
  echoHits = 0;
  echoTotal = 0;
  costN = 0;
  validN = 0;
  costSum = 0;
  costMax = 0;
  $('r-echo').textContent = '—';
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!analyser) return;
  // 實測 rAF 頻率:區分「偵測沒在跑」與「有跑但被音量/清晰度門檻擋掉」
  const nowMs = performance.now();
  if (fpsT0 === 0) fpsT0 = nowMs;
  fpsFrames++;
  if (nowMs - fpsT0 >= 1000) {
    fps = (fpsFrames * 1000) / (nowMs - fpsT0);
    fpsFrames = 0;
    fpsT0 = nowMs;
  }
  analyser.getFloatTimeDomainData(buf);
  const rms = computeRms(buf);
  // 音量條:-60dB → 0%,0dB → 100%
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  $<HTMLElement>('r-meter').style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;

  // 偵測約 30fps:iPhone 單次最大 12ms(第 1 輪),60fps 太緊
  if (frame++ % 2 !== 0) return;
  const s = performance.now();
  const r = detectPitch(buf, rawCtx().sampleRate);
  const cost = performance.now() - s;
  costSum += cost;
  costN++;
  costMax = Math.max(costMax, cost);
  if (costN % 15 === 0) $('r-cost').textContent = detectStats();

  if (!r) return;
  validN++;
  const { midi, cents } = freqToNote(r.freq);
  $('r-note').textContent = midiToName(midi);
  const c = $('r-cents');
  c.textContent = `${cents >= 0 ? '+' : ''}${cents.toFixed(0)}¢`;
  c.className = Math.abs(cents) <= 15 ? 'cents-ok' : 'cents-off';
  $('r-freq').textContent = `${r.freq.toFixed(1)} Hz · clarity ${r.clarity.toFixed(2)}`;

  if (pianoOn) {
    echoTotal++;
    // 比對音級(忽略八度):麥克風收到泛音時常偏一個八度
    if (recentPiano.some((p) => ((p - midi) % 12 + 12) % 12 === 0)) echoHits++;
    $('r-echo').textContent = `${((echoHits / echoTotal) * 100).toFixed(0)}%(${echoHits}/${echoTotal})`;
  }
}

// ---------------- 問卷 ----------------
const QUESTIONS: Array<[id: string, text: string]> = [
  ['p1', 'P1 ② 開麥 → ③ 關麥後(還沒按恢復法):鋼琴確實變小聲?'],
  ['a1', 'A1 按「A」後:喇叭音量恢復正常?'],
  ['b1', 'B1 按「B」後:喇叭音量恢復正常?'],
  ['c1', 'C1 按「C」後:喇叭音量恢復正常?'],
  ['d1', 'D1 按「D」重新整理、再按 ① 後:喇叭音量恢復正常?'],
  ['w1', 'W1 戴有線耳機 開麥 → 關麥 → 拔掉耳機:喇叭音量正常?'],
  ['bt1', 'BT1 藍牙耳機、不出聲:讀數跟著鋼琴跳?'],
  ['bt2', 'BT2 藍牙耳機、唱長音(與鋼琴不同的音):讀數穩定、接近你唱的音?'],
  ['bt3', 'BT3 藍牙耳機開麥後:鋼琴音質變差(像講電話)?'],
];
const CHOICES = ['是', '否', '沒測'];
const saved = loadSaved();
$('questions').innerHTML = QUESTIONS.map(
  ([id, text]) =>
    `<div class="q"><p>${text}</p><div class="choices">` +
    CHOICES.map(
      (c) =>
        `<label><input type="radio" name="${id}" value="${c}"${saved.answers[id] === c ? ' checked' : ''} />${c}</label>`
    ).join('') +
    `</div></div>`
).join('');
$('questions').addEventListener('change', save);

function collectAnswers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id] of QUESTIONS) {
    const v = document.querySelector<HTMLInputElement>(`input[name="${id}"]:checked`)?.value;
    if (v) out[id] = v;
  }
  return out;
}

// ---------------- 結果 ----------------
function buildReport(): string {
  const answers = collectAnswers();
  return [
    '[Vocal Exercises Piano · spike-mic 第 2 輪結果]',
    `時間:${new Date().toLocaleString('zh-TW')}`,
    `AudioContext:${$('r-ctx').textContent}`,
    `${sessionInfo()}`,
    `偵測耗時:${$('r-cost').textContent}`,
    '',
    ...QUESTIONS.map(([id, text]) => `${text} → ${answers[id] ?? '未答'}`),
    '',
    '— 事件紀錄 —',
    ...logLines.slice(-80),
  ].join('\n');
}

$('btn-copy').addEventListener('click', async () => {
  const text = buildReport();
  const ta = $<HTMLTextAreaElement>('report');
  ta.value = text;
  try {
    await navigator.clipboard.writeText(text);
    $('btn-copy').textContent = '已複製 ✓(可直接貼上)';
  } catch {
    // 剪貼簿被擋時退回手動:全選讓使用者長按複製
    ta.focus();
    ta.select();
    $('btn-copy').textContent = '請長按下方文字框手動複製';
  }
});

$('btn-clear').addEventListener('click', () => {
  try {
    sessionStorage.removeItem(STORE);
  } catch {
    /* 忽略 */
  }
  location.reload();
});

// ---------------- 接線 ----------------
function syncButtons(): void {
  $<HTMLButtonElement>('btn-piano').disabled = pianoOn;
  $<HTMLButtonElement>('btn-piano-stop').disabled = !pianoOn;
  $<HTMLButtonElement>('btn-mic').disabled = stream !== null;
  $<HTMLButtonElement>('btn-mic-stop').disabled = stream === null;
  $<HTMLButtonElement>('btn-rec-a').disabled = !audioSession;
}
$('btn-piano').addEventListener('click', () => void startPiano());
$('btn-piano-stop').addEventListener('click', stopPiano);
$('btn-mic').addEventListener('click', () => void startMic());
$('btn-mic-stop').addEventListener('click', stopMic);
$('btn-echo-reset').addEventListener('click', resetEcho);
$('btn-rec-a').addEventListener('click', recoverA);
$('btn-rec-b').addEventListener('click', recoverB);
$('btn-rec-c').addEventListener('click', () => void recoverC());
$('btn-rec-d').addEventListener('click', recoverD);

// 還原重新整理前的紀錄
for (const line of saved.lines) {
  logLines.push(line);
  render(line, false);
}
if (saved.lines.length) log('──── 頁面已重新整理(以上為整理前的紀錄)────');

const standalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia('(display-mode: standalone)').matches;
log(`UA: ${navigator.userAgent}`);
log(`加主畫面模式: ${standalone ? '是' : '否(瀏覽器)'} | secureContext: ${isSecureContext} | ${sessionInfo()}`);
audioSession?.addEventListener?.('statechange', () => log(`audioSession statechange → ${sessionInfo()}`));
navigator.mediaDevices?.addEventListener?.('devicechange', () => void logDevices('devicechange → '));
document.addEventListener('visibilitychange', () => log(`visibility → ${document.visibilityState}`));
// 載入時不碰 AudioContext:正式 app 要等使用者按播放才建立,提早建立會讓測試條件失真
$('r-session').textContent = sessionInfo();
syncButtons();
