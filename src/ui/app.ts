import { ensureAudioRunning, loadSampler, onAudioContextStateChange } from '../audio/player.ts';
import { SessionPlayer, type SessionState } from '../session/player.ts';
import { unlockAudioSession } from '../platform/ios-audio.ts';
import { requestWakeLock, releaseWakeLock } from '../platform/wake-lock.ts';
import type { SessionParams } from '../session/plan.ts';
import { computeSungRange, checkSungRange } from '../session/range.ts';
import { SCALES } from '../theory/scale.ts';
import { PATTERNS, parsePatternDsl } from '../theory/pattern.ts';
import { midiToName } from '../theory/note-name.ts';
import {
  loadParams,
  saveParams,
  PARAM_LIMITS,
  type AppParams,
} from '../state/params.ts';

/** 長按連續步進(SPEC 4.2):按住後 400ms 開始,每 80ms 觸發一次 */
function bindStepper(btn: HTMLElement, fn: () => void): void {
  let holdTimer: number | undefined;
  let repeatTimer: number | undefined;
  const stop = () => {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if ((btn as HTMLButtonElement).disabled) return;
    fn();
    holdTimer = window.setTimeout(() => {
      repeatTimer = window.setInterval(fn, 80);
    }, 400);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
    btn.addEventListener(ev, stop);
  }
}

export function mountApp(root: HTMLElement, storage: Storage): void {
  let params: AppParams = loadParams(storage);
  let playback: SessionState = 'idle';
  let loading = false;
  let interrupted = false; // 被來電 / 切 app 中斷而暫停(SPEC 3.5)
  let player: SessionPlayer | null = null;

  root.innerHTML = `
    <h1>聲樂音階練習</h1>

    <div class="panel">
      <div class="row">
        <label for="scale">音階</label>
        <select id="scale"></select>
      </div>
      <div class="row">
        <label for="pattern">音型</label>
        <select id="pattern"></select>
      </div>
    </div>

    <div class="panel">
      <div class="row">
        <label>起始音</label>
        <div class="stepper">
          <button class="step-btn" id="start-dn" aria-label="起始音降低">−</button>
          <span class="value" id="start-val"></span>
          <button class="step-btn" id="start-up" aria-label="起始音升高">+</button>
        </div>
      </div>
      <div class="row">
        <label>最高根音</label>
        <div class="stepper">
          <button class="step-btn" id="top-dn" aria-label="最高根音降低">−</button>
          <span class="value" id="top-val"></span>
          <button class="step-btn" id="top-up" aria-label="最高根音升高">+</button>
        </div>
      </div>
      <div class="row">
        <label for="bpm">速度</label>
        <input type="range" id="bpm" min="${PARAM_LIMITS.bpm.min}" max="${PARAM_LIMITS.bpm.max}" step="1" />
        <span class="value" id="bpm-val"></span>
      </div>
      <div class="row">
        <label>間隔</label>
        <div class="stepper">
          <button class="step-btn" id="gap-dn" aria-label="間隔減少">−</button>
          <span class="value" id="gap-val"></span>
          <button class="step-btn" id="gap-up" aria-label="間隔增加">+</button>
        </div>
      </div>
      <div class="row">
        <label for="cue">提示和弦強制大三和弦</label>
        <input type="checkbox" id="cue" style="width:24px;height:24px;" />
      </div>
    </div>

    <div class="panel range-feedback" id="range">
      <div>本次最高演唱音:<span class="hi" id="range-hi"></span></div>
      <div>本次最低演唱音:<span class="lo" id="range-lo"></span></div>
      <div class="problem" id="range-problem"></div>
    </div>

    <div class="panel now-playing">
      <div class="now-root" id="now-root">起音 —</div>
      <div class="now-note" id="now-note">—</div>
      <div class="now-progress" id="now-progress"></div>
      <div class="now-state" id="now-state">idle</div>
    </div>

    <details>
      <summary>加入主畫面(iOS)</summary>
      <p>iOS Safari 沒有安裝提示。請點底部工具列的「分享」→「加入主畫面」,即可像 App 一樣全螢幕、離線使用。</p>
    </details>

    <footer>
      鋼琴音源:Salamander Grand Piano，作者 Alexander Holm，授權
      <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener">CC BY 3.0</a>。
    </footer>

    <div class="controls">
      <button class="primary" id="play">▶ 開始</button>
      <button id="stop">■ 停止</button>
    </div>
  `;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const scaleSel = $<HTMLSelectElement>('scale');
  const patternSel = $<HTMLSelectElement>('pattern');
  const bpmSlider = $<HTMLInputElement>('bpm');
  const cueChk = $<HTMLInputElement>('cue');
  const rangePanel = $('range');
  const rangeHi = $('range-hi');
  const rangeLo = $('range-lo');
  const rangeProblem = $('range-problem');
  const nowRoot = $('now-root');
  const nowNote = $('now-note');
  const nowProgress = $('now-progress');
  const nowState = $('now-state');
  const playBtn = $<HTMLButtonElement>('play');
  const stopBtn = $<HTMLButtonElement>('stop');

  for (const s of SCALES) {
    scaleSel.add(new Option(s.name, s.id));
  }
  for (const p of PATTERNS) {
    patternSel.add(new Option(p.name, p.id));
  }

  const isActive = () =>
    playback === 'countIn' || playback === 'playing' || playback === 'gap' || playback === 'paused';

  function currentScale() {
    return SCALES.find((s) => s.id === params.scaleId)!;
  }
  function currentPatternNotes() {
    return parsePatternDsl(PATTERNS.find((p) => p.id === params.patternId)!.dsl);
  }

  function refreshParamDisplay(): void {
    scaleSel.value = params.scaleId;
    patternSel.value = params.patternId;
    bpmSlider.value = String(params.bpm);
    cueChk.checked = params.forceMajorCue;
    $('start-val').textContent = midiToName(params.startRoot);
    $('top-val').textContent = midiToName(params.topRoot);
    $('bpm-val').textContent = String(params.bpm);
    $('gap-val').textContent = `${params.gapBeats} 拍`;

    const range = computeSungRange(currentPatternNotes(), currentScale(), params.startRoot, params.topRoot);
    const check = checkSungRange(range);
    rangeHi.textContent = midiToName(range.maxMidi);
    rangeLo.textContent = midiToName(range.minMidi);
    rangePanel.classList.toggle('warn', !check.ok);
    rangeProblem.textContent = check.problems.join('；');

    // 播放中禁用參數(SPEC 2.4);音域超標則 disable 開始
    const disableParams = isActive();
    for (const el of [scaleSel, patternSel, bpmSlider, cueChk]) el.disabled = disableParams;
    for (const id of ['start-dn', 'start-up', 'top-dn', 'top-up', 'gap-dn', 'gap-up']) {
      $<HTMLButtonElement>(id).disabled = disableParams;
    }
    // 音域超標:idle 時 disable 開始(SPEC 2.5);播放/暫停中的按鈕是暫停/繼續,不受此限
    playBtn.disabled = loading || (!isActive() && !check.ok);
    if (!isActive()) {
      nowRoot.textContent = `起音 ${midiToName(params.startRoot)}`;
    }
  }

  function refreshPlaybackDisplay(): void {
    if (loading) nowState.textContent = '載入中…';
    else if (interrupted && playback === 'paused') nowState.textContent = '已中斷(來電/切換 app),點「繼續」接續';
    else nowState.textContent = playback;
    if (playback === 'paused') {
      playBtn.textContent = '▶ 繼續';
    } else if (isActive()) {
      playBtn.textContent = '⏸ 暫停';
    } else {
      playBtn.textContent = loading ? '載入中…' : '▶ 開始';
    }
    stopBtn.disabled = !isActive() && !loading;
    if (!isActive()) {
      nowNote.textContent = '—';
      nowProgress.textContent = '';
    }
    refreshParamDisplay();
  }

  function pulseNote(midi: number): void {
    nowNote.textContent = midiToName(midi);
    nowNote.classList.remove('pulse');
    void nowNote.offsetWidth; // 強制 reflow 以重啟動畫
    nowNote.classList.add('pulse');
  }

  function makeSessionParams(): SessionParams {
    return {
      scale: currentScale(),
      pattern: currentPatternNotes(),
      startRoot: params.startRoot,
      topRoot: params.topRoot,
      gapBeats: params.gapBeats,
      forceMajorCue: params.forceMajorCue,
    };
  }

  function update(mutate: (p: AppParams) => void): void {
    if (isActive()) return; // 播放中不接受參數變更
    mutate(params);
    saveParams(storage, params);
    refreshParamDisplay();
  }

  // 參數事件
  scaleSel.addEventListener('change', () => update((p) => (p.scaleId = scaleSel.value)));
  patternSel.addEventListener('change', () => update((p) => (p.patternId = patternSel.value)));
  bpmSlider.addEventListener('input', () => update((p) => (p.bpm = Number(bpmSlider.value))));
  cueChk.addEventListener('change', () => update((p) => (p.forceMajorCue = cueChk.checked)));

  bindStepper($('start-dn'), () =>
    update((p) => (p.startRoot = Math.max(PARAM_LIMITS.root.min, p.startRoot - 1)))
  );
  bindStepper($('start-up'), () =>
    update((p) => {
      p.startRoot = Math.min(PARAM_LIMITS.root.max, p.startRoot + 1);
      if (p.startRoot > p.topRoot) p.topRoot = p.startRoot; // 連動(SPEC 2.5)
    })
  );
  bindStepper($('top-dn'), () =>
    update((p) => (p.topRoot = Math.max(p.startRoot, p.topRoot - 1)))
  );
  bindStepper($('top-up'), () =>
    update((p) => (p.topRoot = Math.min(PARAM_LIMITS.root.max, p.topRoot + 1)))
  );
  bindStepper($('gap-dn'), () =>
    update((p) => (p.gapBeats = Math.max(PARAM_LIMITS.gapBeats.min, p.gapBeats - 1)))
  );
  bindStepper($('gap-up'), () =>
    update((p) => (p.gapBeats = Math.min(PARAM_LIMITS.gapBeats.max, p.gapBeats + 1)))
  );

  // Session 進行中保持螢幕喚醒(SPEC 3.4.3);暫停 / 結束 / 停止則釋放
  function syncWakeLock(): void {
    if (isActive() && playback !== 'paused') void requestWakeLock();
    else void releaseWakeLock();
  }

  let contextListenerBound = false;
  function bindContextInterruption(): void {
    if (contextListenerBound) return;
    contextListenerBound = true;
    // 來電 / 切換 app → context suspended:進入 paused 並提示,不靜默空跑(SPEC 3.5)
    onAudioContextStateChange((state) => {
      if (state !== 'running' && player && isActive() && playback !== 'paused') {
        player.pause();
        interrupted = true;
        refreshPlaybackDisplay();
      }
    });
  }

  async function getPlayer(): Promise<SessionPlayer> {
    await ensureAudioRunning();
    const sampler = await loadSampler();
    bindContextInterruption();
    if (!player) {
      player = new SessionPlayer(sampler, {
        onStateChange: (s) => {
          playback = s;
          syncWakeLock();
          refreshPlaybackDisplay();
        },
        onRunChange: (i, count, r, dir) => {
          nowRoot.textContent = `${midiToName(r)} ${dir === 'up' ? '↑' : '↓'}`;
          nowProgress.textContent = `第 ${i + 1} / ${count} 次`;
        },
        onNote: (midi) => pulseNote(midi),
      });
    }
    return player;
  }

  playBtn.addEventListener('click', async () => {
    if (playback === 'paused') {
      // resume 前先確保 context 已從 suspended 恢復(來電中斷後尤其必要,SPEC 3.5)
      try {
        await ensureAudioRunning();
        interrupted = false;
        player?.resume();
      } catch (err) {
        nowState.textContent = `錯誤:${err instanceof Error ? err.message : String(err)}`;
      }
      return;
    }
    if (isActive()) {
      player?.pause();
      return;
    }
    // idle / finished → 開始。unlock 必須在手勢同步鏈內、任何 await 之前(SPEC 3.4.2)
    unlockAudioSession();
    interrupted = false;
    loading = true;
    refreshPlaybackDisplay();
    try {
      const p = await getPlayer();
      if (p.getState() !== 'idle' && p.getState() !== 'finished') p.stop();
      loading = false;
      p.start(makeSessionParams(), params.bpm);
    } catch (err) {
      loading = false;
      playback = 'idle';
      nowState.textContent = `錯誤:${err instanceof Error ? err.message : String(err)}`;
      refreshPlaybackDisplay();
    }
  });

  stopBtn.addEventListener('click', () => {
    player?.stop();
    playback = 'idle';
    interrupted = false;
    refreshPlaybackDisplay();
  });

  refreshPlaybackDisplay();
}
