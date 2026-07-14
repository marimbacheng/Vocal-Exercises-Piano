import { describe, it, expect } from 'vitest';
import {
  buildRootSequence,
  buildTriad,
  buildSessionTimeline,
  type SessionParams,
  type TriadEvent,
  type NoteEvent,
} from './plan.ts';
import { SCALES } from '../theory/scale.ts';
import { parsePatternDsl, PATTERNS } from '../theory/pattern.ts';

const major = SCALES.find((s) => s.id === 'major')!;
const naturalMinor = SCALES.find((s) => s.id === 'natural-minor')!;
const p5x1 = parsePatternDsl('1 2 3 4 5 4 3 2 1');

const baseParams: SessionParams = {
  scale: major,
  pattern: p5x1,
  startRoot: 60, // C4
  topRoot: 72, // C5
  gapBeats: 2,
};

describe('buildRootSequence', () => {
  it('C4→C5→C4 共 25 個 run(SPEC M2 gate)', () => {
    const roots = buildRootSequence(60, 72);
    expect(roots).toHaveLength(25); // 2*(72-60)+1
  });

  it('root 序列逐一比對:上行 60..72、下行 71..60', () => {
    const roots = buildRootSequence(60, 72);
    const expected = [
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
      71, 70, 69, 68, 67, 66, 65, 64, 63, 62, 61, 60,
    ];
    expect(roots).toEqual(expected);
  });

  it('topRoot 只出現一次', () => {
    const roots = buildRootSequence(60, 72);
    expect(roots.filter((r) => r === 72)).toHaveLength(1);
  });

  it('topRoot == startRoot → 1 個 run', () => {
    expect(buildRootSequence(60, 60)).toEqual([60]);
  });

  it('topRoot < startRoot → throw', () => {
    expect(() => buildRootSequence(60, 59)).toThrow();
  });
});

describe('buildTriad', () => {
  it('major:C4 → C4 E4 G4', () => {
    expect(buildTriad(60, major)).toEqual([60, 64, 67]);
  });

  it('natural minor:C4 → 小三和弦 C4 Eb4 G4', () => {
    expect(buildTriad(60, naturalMinor)).toEqual([60, 63, 67]);
  });

});

describe('buildSessionTimeline — 結構', () => {
  const tl = buildSessionTimeline(baseParams);
  const triads = tl.events.filter((e): e is TriadEvent => e.kind === 'triad');
  const notes = tl.events.filter((e): e is NoteEvent => e.kind === 'note');

  it('25 個 run、每 run 9 音', () => {
    expect(tl.runCount).toBe(25);
    expect(notes).toHaveLength(25 * 9);
  });

  it('count-in 是第一個事件:startRoot triad、長 gapBeats、位於 beat 0', () => {
    const first = tl.events[0];
    expect(first.kind).toBe('triad');
    const t = first as TriadEvent;
    expect(t.role).toBe('countIn');
    expect(t.atBeat).toBe(0);
    expect(t.beats).toBe(2);
    expect(t.midis).toEqual([60, 64, 67]);
  });

  it('gap 數 = run 數 - 1,每個 gap 兩個 triad(current → next)', () => {
    const gapCurrents = triads.filter((t) => t.role === 'gapCurrent');
    const gapNexts = triads.filter((t) => t.role === 'gapNext');
    expect(gapCurrents).toHaveLength(24);
    expect(gapNexts).toHaveLength(24);
    for (let i = 0; i < 24; i++) {
      expect(gapCurrents[i].root).toBe(tl.roots[i]);
      expect(gapNexts[i].root).toBe(tl.roots[i + 1]);
      // current 在前、next 緊接其後
      expect(gapNexts[i].atBeat).toBe(gapCurrents[i].atBeat + gapCurrents[i].beats);
    }
  });

  it('最後事件屬於最後一個 run 的音符(無尾隨 gap)', () => {
    const last = tl.events[tl.events.length - 1];
    expect(last.kind).toBe('note');
    expect((last as NoteEvent).runIndex).toBe(24);
    expect(last.atBeat + last.beats).toBe(tl.totalBeats);
  });

  it('totalBeats = count-in 2 + 25 run × 9 拍 + 24 gap ×(2+1)拍', () => {
    // 每個 gap 因換 key 和弦多拉長一拍,總長 gapBeats + 1 = 3
    expect(tl.totalBeats).toBe(2 + 25 * 9 + 24 * 3);
  });

  it('run 的音高正確:第 0 run 是 C4 大調 1..5..1', () => {
    const run0 = notes.filter((n) => n.runIndex === 0).map((n) => n.midi);
    expect(run0).toEqual([60, 62, 64, 65, 67, 65, 64, 62, 60]);
  });

  it('topRoot == startRoot → 1 run、無 gap、count-in 仍在', () => {
    const single = buildSessionTimeline({ ...baseParams, topRoot: 60 });
    expect(single.runCount).toBe(1);
    const t = single.events.filter((e) => e.kind === 'triad');
    expect(t).toHaveLength(1);
    expect((t[0] as TriadEvent).role).toBe('countIn');
  });
});

describe('buildSessionTimeline — 全部 12 內建音型皆可建出 timeline(M3 gate)', () => {
  it.each(PATTERNS.map((p) => [p.id, p] as const))('%s 產生非空且拍數遞增的 timeline', (_id, pattern) => {
    const tl = buildSessionTimeline({ ...baseParams, pattern: pattern.notes });
    expect(tl.events.length).toBeGreaterThan(0);
    // 事件 atBeat 單調不遞減、每個 run 音符數 = pattern 長度
    let prev = -1;
    for (const ev of tl.events) {
      expect(ev.atBeat).toBeGreaterThanOrEqual(prev);
      prev = ev.atBeat;
    }
    const notes = tl.events.filter((e) => e.kind === 'note');
    expect(notes.length).toBe(pattern.notes.length * tl.runCount);
  });
});

describe('buildSessionTimeline — gapBeats 佈局(SPEC 2.3)', () => {
  function firstGap(gapBeats: number): [TriadEvent, TriadEvent] {
    const tl = buildSessionTimeline({ ...baseParams, topRoot: 61, gapBeats });
    const triads = tl.events.filter((e): e is TriadEvent => e.kind === 'triad');
    return [
      triads.find((t) => t.role === 'gapCurrent')!,
      triads.find((t) => t.role === 'gapNext')!,
    ];
  }

  // current triad = gapBeats/2;next-key triad = gapBeats/2 + 1(換 key 和弦多一拍)
  it('gapBeats=2:current 1 拍、next 2 拍', () => {
    const [cur, next] = firstGap(2);
    expect(cur.beats).toBe(1);
    expect(next.beats).toBe(2);
    expect(next.atBeat - cur.atBeat).toBe(1); // next 緊接 current 之後(current 長 1 拍)
  });

  it('gapBeats=1:current 0.5、next 1.5', () => {
    const [cur, next] = firstGap(1);
    expect(cur.beats).toBe(0.5);
    expect(next.beats).toBe(1.5);
  });

  it('gapBeats=3:current 1.5、next 2.5', () => {
    const [cur, next] = firstGap(3);
    expect(cur.beats).toBe(1.5);
    expect(next.beats).toBe(2.5);
  });

  it('gapBeats=4:current 2、next 3', () => {
    const [cur, next] = firstGap(4);
    expect(cur.beats).toBe(2);
    expect(next.beats).toBe(3);
  });
});

describe('buildSessionTimeline — 換 key 單和弦間隔(singleChordGap 旗標)', () => {
  const arp = parsePatternDsl('1:0.33333 3:0.33333 5:0.33333 1:0.66666 1:0.33333');
  const tl = buildSessionTimeline({ ...baseParams, pattern: arp, topRoot: 62, singleChordGap: true });
  const triads = tl.events.filter((e): e is TriadEvent => e.kind === 'triad');

  it('換 key 間隔只有一個 triad(新調),無 gapCurrent', () => {
    expect(triads.filter((t) => t.role === 'gapCurrent')).toHaveLength(0);
    const gapNexts = triads.filter((t) => t.role === 'gapNext');
    // topRoot=62 → 3 個 run(60,61,62,61,60 其實是 5 個);gap 數 = run-1
    expect(gapNexts).toHaveLength(tl.runCount - 1);
  });

  it('新調 triad 長一整拍(2 個四分拍)、和弦為下一 key 的 1-3-5', () => {
    const gapNext = triads.find((t) => t.role === 'gapNext')!;
    expect(gapNext.beats).toBe(2);
    expect(gapNext.root).toBe(tl.roots[1]);
    expect(gapNext.midis).toEqual(buildTriad(tl.roots[1], major));
  });

  it('每個 gap 佔 2 拍(結尾收在 pattern 內)', () => {
    // count-in 2 + run 數 × pattern拍 + (run-1) × 2
    const patternBeats = arp.reduce((s, n) => s + n.beats, 0); // ≈ 2 拍
    expect(tl.totalBeats).toBeCloseTo(2 + tl.runCount * patternBeats + (tl.runCount - 1) * 2, 3);
  });
});
