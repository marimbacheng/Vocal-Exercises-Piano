// SPIKE(丟棄式):驗證 iOS 上「播放取樣鋼琴」與「getUserMedia 麥克風」同時進行是否互相干擾。
// 刻意沿用正式的 unlockAudioSession + loadSampler + Tone context,測的是實際上線的音訊組合。
// 驗證完成後整個 src/spike/ 與 spike-mic.html 連同 vite.config 的入口一起刪除。
import * as Tone from 'tone';
import { unlockAudioSession } from '../platform/ios-audio.ts';
import { ensureAudioRunning, loadSampler, onAudioContextStateChange } from '../audio/player.ts';
import { midiToName } from '../theory/note-name.ts';
import { computeRms, detectPitch, freqToNote } from './pitch.ts';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------------- 事件紀錄 ----------------
const t0 = performance.now();
const logLines: string[] = [];
function log(msg: string, warn = false): void {
  const line = `[${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`;
  logLines.push(line);
  const el = $('log');
  const row = document.createElement('div');
  row.textContent = line;
  if (warn) row.className = 'warn';
  el.appendChild(row);
  el.scrollTop = el.scrollHeight;
}
const errText = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));

// ---------------- 環境診斷 ----------------
const standalone =
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  matchMedia('(display-mode: standalone)').matches;
log(`UA: ${navigator.userAgent}`);
log(`加主畫面模式: ${standalone ? '是' : '否(瀏覽器)'} | secureContext: ${isSecureContext} | mediaDevices: ${!!navigator.mediaDevices?.getUserMedia}`);

function rawCtx(): AudioContext {
  return Tone.getContext().rawContext as unknown as AudioContext;
}
function refreshCtx(): void {
  const c = rawCtx();
  const out = (c as AudioContext & { outputLatency?: number }).outputLatency;
  $('r-ctx').textContent =
    `${c.state} · ${c.sampleRate}Hz · base ${(c.baseLatency * 1000).toFixed(1)}ms` +
    (out !== undefined ? ` · out ${(out * 1000).toFixed(1)}ms` : '');
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

/** 記錄當下的預設輸入/輸出裝置。iOS 通常不列 audiooutput,會顯示「(未提供)」 */
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
navigator.mediaDevices?.addEventListener?.('devicechange', () => void logDevices('devicechange → '));
document.addEventListener('visibilitychange', () => log(`visibility → ${document.visibilityState}`));

// ---------------- 鋼琴循環 ----------------
const ARPEGGIO = [60, 64, 67, 72]; // C4 E4 G4 C5
let sampler: Tone.Sampler | null = null;
let pianoOn = false;
let loopId: number | null = null;
let arpIdx = 0;
/** 最近兩個鋼琴音(前一顆的殘響也可能被收到) */
const recentPiano: number[] = [];

async function startPiano(): Promise<void> {
  // 與正式 app 相同順序:手勢同步鏈內先 unlock,才能 await(SPEC 3.4.2)
  const created = unlockAudioSession();
  log(`unlockAudioSession(): ${created ? '建立無聲循環 audio' : '已建立過'}`);
  try {
    await ensureAudioRunning();
    bindCtxListener();
    refreshCtx();
    log('Tone.start() 完成');
    sampler = await loadSampler();
    log('取樣載入完成');
  } catch (e) {
    log(`播放失敗:${errText(e)}`, true);
    return;
  }
  const transport = Tone.getTransport();
  transport.bpm.value = 80;
  loopId = transport.scheduleRepeat((time) => {
    const midi = ARPEGGIO[arpIdx++ % ARPEGGIO.length];
    sampler?.triggerAttackRelease(Tone.Frequency(midi, 'midi').toNote(), '8n', time);
    Tone.getDraw().schedule(() => {
      recentPiano.unshift(midi);
      recentPiano.length = Math.min(recentPiano.length, 2);
      $('r-piano').textContent = midiToName(midi);
    }, time);
  }, '4n');
  transport.start();
  pianoOn = true;
  log('鋼琴循環開始(C4 E4 G4 C5,80 BPM)');
  syncButtons();
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
  const constraints: MediaTrackConstraints = {
    echoCancellation: $<HTMLInputElement>('opt-ec').checked,
    noiseSuppression: $<HTMLInputElement>('opt-ns').checked,
    autoGainControl: $<HTMLInputElement>('opt-agc').checked,
  };
  log(`getUserMedia 請求:${JSON.stringify(constraints)}`);
  try {
    // 分析需要 context 在跑;不呼叫 unlockAudioSession,保留「只開麥」這個測試情境
    await ensureAudioRunning();
    bindCtxListener();
    stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (e) {
    log(`麥克風失敗:${errText(e)}`, true);
    return;
  }
  const track = stream.getAudioTracks()[0];
  log(`麥克風取得:${track.label || '(無標籤)'}`);
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
  log('麥克風關閉(tracks stopped)');
  refreshCtx();
  syncButtons();
}

// ---------------- 偵測迴圈 ----------------
let frame = 0;
let costSum = 0;
let costN = 0;
let costMax = 0;
let echoHits = 0;
let echoTotal = 0;

/** 把目前這一段的「收到鋼琴聲」寫進紀錄,讓每種情境(外放/有線/藍牙)各有一筆數字 */
function logEchoSegment(reason: string): void {
  if (echoTotal === 0) return;
  log(`收到鋼琴聲(${reason}):${((echoHits / echoTotal) * 100).toFixed(0)}%(${echoHits}/${echoTotal})`);
}

function resetEcho(): void {
  logEchoSegment('本段結束,已重算');
  echoHits = 0;
  echoTotal = 0;
  $('r-echo').textContent = '—';
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!analyser) return;
  analyser.getFloatTimeDomainData(buf);
  const rms = computeRms(buf);
  // 音量條:-60dB → 0%,0dB → 100%
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  $<HTMLElement>('r-meter').style.width = `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;

  // 偵測降到約 30fps:iPhone 的運算成本未知,先保守
  if (frame++ % 2 !== 0) return;
  const s = performance.now();
  const r = detectPitch(buf, rawCtx().sampleRate);
  const cost = performance.now() - s;
  costSum += cost;
  costN++;
  costMax = Math.max(costMax, cost);
  if (costN % 15 === 0) $('r-cost').textContent = `平均 ${(costSum / costN).toFixed(2)} ms · 最大 ${costMax.toFixed(2)} ms`;

  if (!r) return;
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
  ['q1', 'Q1 開麥前:鋼琴從喇叭正常出聲?'],
  ['q2', 'Q2 開麥前:切到靜音模式(側邊開關)仍有聲?'],
  ['q3', 'Q3 開麥後:鋼琴仍從喇叭出聲(不是跑到聽筒、要貼耳才聽得到)?'],
  ['q4', 'Q4 開麥後:音量明顯變小?'],
  ['q5', 'Q5 開麥後:切到靜音模式仍有聲?'],
  ['q6', 'Q6 開麥後、不出聲時:「收到鋼琴聲」比例很高 / 讀數跟著鋼琴跳?'],
  ['q7', 'Q7 唱一個長音:讀數穩定、接近你唱的音?'],
  ['q8', 'Q8 關麥後:音量與路由恢復正常?'],
  ['q9', 'Q9 戴有線耳機重測:一切正常、讀數只跟著你的聲音?'],
  ['q10', 'Q10 戴藍牙耳機重測:開麥後鋼琴音質變差(像講電話)?'],
];
const CHOICES = ['是', '否', '沒測'];
$('questions').innerHTML = QUESTIONS.map(
  ([id, text]) =>
    `<div class="q"><p>${text}</p><div class="choices">` +
    CHOICES.map((c) => `<label><input type="radio" name="${id}" value="${c}" />${c}</label>`).join('') +
    `</div></div>`
).join('');

// ---------------- 結果 ----------------
function buildReport(): string {
  const answers = QUESTIONS.map(([id, text]) => {
    const v = document.querySelector<HTMLInputElement>(`input[name="${id}"]:checked`)?.value ?? '未答';
    return `${text} → ${v}`;
  });
  return [
    '[Vocal Exercises Piano · spike-mic 結果]',
    `時間:${new Date().toLocaleString('zh-TW')}`,
    `AudioContext:${$('r-ctx').textContent}`,
    `偵測耗時:${$('r-cost').textContent}`,
    `收到鋼琴聲:${$('r-echo').textContent}`,
    '',
    ...answers,
    '',
    '— 事件紀錄 —',
    ...logLines.slice(-60),
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

// ---------------- 接線 ----------------
function syncButtons(): void {
  $<HTMLButtonElement>('btn-piano').disabled = pianoOn;
  $<HTMLButtonElement>('btn-piano-stop').disabled = !pianoOn;
  $<HTMLButtonElement>('btn-mic').disabled = stream !== null;
  $<HTMLButtonElement>('btn-mic-stop').disabled = stream === null;
}
$('btn-piano').addEventListener('click', () => void startPiano());
$('btn-piano-stop').addEventListener('click', stopPiano);
$('btn-mic').addEventListener('click', () => void startMic());
$('btn-mic-stop').addEventListener('click', stopMic);
$('btn-echo-reset').addEventListener('click', resetEcho);
syncButtons();
