import * as Tone from 'tone';
import type { SessionParams, SessionTimeline } from './plan.ts';
import { buildSessionTimeline } from './plan.ts';

export type SessionState = 'idle' | 'countIn' | 'playing' | 'gap' | 'paused' | 'finished';

export type SessionCallbacks = {
  onStateChange?: (state: SessionState) => void;
  /** run 進入時觸發。direction:上行(含 topRoot)↑、下行 ↓ */
  onRunChange?: (runIndex: number, runCount: number, root: number, direction: 'up' | 'down') => void;
  onNote?: (midi: number, indexInRun: number) => void;
};

/**
 * 把 buildSessionTimeline 的事件排上 Tone.Transport(單一排程來源,無累積
 * drift;陷阱 #6)。pause 立即靜音並暫停;resume 從當前 run 的開頭重排(SPEC 2.4)。
 */
export class SessionPlayer {
  private state: SessionState = 'idle';
  private timeline: SessionTimeline | null = null;
  private params: SessionParams | null = null;
  private bpm = 80;
  /** 正在(或剛剛)演唱的 run;gap 期間維持在上一個唱過的 run。resume 由此重排 */
  private currentRunIndex = 0;

  constructor(
    private sampler: Tone.Sampler,
    private callbacks: SessionCallbacks = {}
  ) {}

  getState(): SessionState {
    return this.state;
  }

  /** 呼叫端須先 ensureAudioRunning() + loadSampler() */
  start(params: SessionParams, bpm: number): void {
    if (this.state !== 'idle' && this.state !== 'finished') {
      throw new Error(`不可在 ${this.state} 狀態下 start`);
    }
    this.timeline = buildSessionTimeline(params);
    this.params = params;
    this.bpm = bpm;
    this.currentRunIndex = 0;
    this.scheduleAndStart(0);
  }

  /** 立即靜音並暫停 transport(SPEC 2.4) */
  pause(): void {
    if (this.state !== 'countIn' && this.state !== 'playing' && this.state !== 'gap') {
      return;
    }
    const transport = Tone.getTransport();
    transport.pause();
    transport.cancel(0);
    this.sampler.releaseAll();
    this.setState('paused');
  }

  /** 從當前 run 的開頭重新開始(不從半個 run 中間接續;SPEC 2.4) */
  resume(): void {
    if (this.state !== 'paused' || !this.timeline) return;
    this.scheduleAndStart(this.currentRunIndex);
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
    this.sampler.releaseAll();
    this.timeline = null;
    this.params = null;
    this.setState('idle');
  }

  /**
   * 從 fromRunIndex 起排程並啟動。fromRunIndex === 0 時含 count-in;
   * resume 時略過 count-in 與該 run 之前的 gap,時間軸重定基準。
   */
  private scheduleAndStart(fromRunIndex: number): void {
    const timeline = this.timeline!;
    const params = this.params!;
    const includeCountIn = fromRunIndex === 0;

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    transport.position = 0;
    // UI 的速度為二分音符 BPM;pattern 的 beats 以四分音符計,故四分音符速度為其兩倍
    const quarterBpm = this.bpm * 2;
    transport.bpm.value = quarterBpm;

    const secondsPerBeat = 60 / quarterBpm;
    const ppq = transport.PPQ;
    const peakIndex = params.topRoot - params.startRoot;

    const firstNoteOfFrom = timeline.events.find(
      (e) => e.kind === 'note' && e.runIndex === fromRunIndex
    )!;
    const offsetBeat = includeCountIn ? 0 : firstNoteOfFrom.atBeat;
    const at = (beat: number) => `${Math.round((beat - offsetBeat) * ppq)}i`;

    const included = timeline.events.filter((ev) => {
      if (ev.kind === 'note') return ev.runIndex >= fromRunIndex;
      if (ev.role === 'countIn') return includeCountIn;
      // gap triad 的 runIndex = 後接 run;只保留 fromRunIndex 之後的 gap
      return ev.runIndex > fromRunIndex;
    });

    for (const ev of included) {
      const durationSec = ev.beats * secondsPerBeat;
      if (ev.kind === 'note') {
        transport.schedule((time) => {
          this.sampler.triggerAttackRelease(
            Tone.Frequency(ev.midi, 'midi').toFrequency(),
            durationSec,
            time
          );
          this.callbacks.onNote?.(ev.midi, ev.indexInRun);
        }, at(ev.atBeat));
      } else {
        transport.schedule((time) => {
          const freqs = ev.midis.map((m) => Tone.Frequency(m, 'midi').toFrequency());
          this.sampler.triggerAttackRelease(freqs, durationSec, time);
        }, at(ev.atBeat));
        if (ev.role === 'countIn') {
          transport.schedule(() => this.setState('countIn'), at(ev.atBeat));
        } else if (ev.role === 'gapCurrent') {
          transport.schedule(() => this.setState('gap'), at(ev.atBeat));
        }
      }
    }

    // run 邊界:每個 run 的第一個音符事件(自 fromRunIndex 起)
    for (let i = fromRunIndex; i < timeline.runCount; i++) {
      const firstNote = timeline.events.find((e) => e.kind === 'note' && e.runIndex === i)!;
      const root = firstNote.kind === 'note' ? firstNote.root : 0;
      transport.schedule(() => {
        this.currentRunIndex = i;
        this.setState('playing');
        this.callbacks.onRunChange?.(i, timeline.runCount, root, i <= peakIndex ? 'up' : 'down');
      }, at(firstNote.atBeat));
    }

    // 結尾:最後一個 run 之後直接 finished,無多餘 gap(SPEC 2.3)。
    // 先 cancel 再 stop:stop 會把 position 歸零,若不先清空排程,
    // tick 0 的事件會在同一個 lookahead 內被重放
    transport.schedule((time) => {
      this.setState('finished');
      transport.cancel(0);
      transport.stop(time);
    }, at(timeline.totalBeats));

    transport.start();
  }

  private setState(state: SessionState): void {
    if (this.state === state) return;
    this.state = state;
    this.callbacks.onStateChange?.(state);
  }
}
