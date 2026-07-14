import { degreeToMidi } from '../theory/degree.ts';
import type { Scale } from '../theory/scale.ts';
import type { Note } from '../theory/pattern.ts';

export type SessionParams = {
  scale: Scale;
  pattern: Note[];
  startRoot: number;
  topRoot: number;
  gapBeats: number;
};

export type NoteEvent = {
  kind: 'note';
  atBeat: number;
  beats: number;
  midi: number;
  runIndex: number;
  /** 此音在 pattern 中的序號(0-based),供 UI 音型輪廓高亮 */
  indexInRun: number;
  root: number;
};

export type TriadEvent = {
  kind: 'triad';
  atBeat: number;
  beats: number;
  midis: number[];
  role: 'countIn' | 'gapCurrent' | 'gapNext';
  /** 這個 triad 之後接著的 run(count-in → 0;run i 之後的 gap → i+1) */
  runIndex: number;
  root: number;
};

export type TimelineEvent = NoteEvent | TriadEvent;

export type SessionTimeline = {
  events: TimelineEvent[];
  totalBeats: number;
  roots: number[];
  runCount: number;
};

/**
 * startRoot 半音上行至 topRoot 再下行回 startRoot。
 * topRoot 只出現一次;總長 2*(topRoot-startRoot)+1(SPEC 2.2)。
 */
export function buildRootSequence(startRoot: number, topRoot: number): number[] {
  if (topRoot < startRoot) {
    throw new Error(`topRoot (${topRoot}) 不可低於 startRoot (${startRoot})`);
  }
  const roots: number[] = [];
  for (let r = startRoot; r <= topRoot; r++) roots.push(r);
  for (let r = topRoot - 1; r >= startRoot; r--) roots.push(r);
  return roots;
}

/** 提示和弦音高(SPEC 2.3):取 scale 的 degree 1/3/5,跟隨所選音階 */
export function buildTriad(root: number, scale: Scale): number[] {
  return [1, 3, 5].map((d) => degreeToMidi(d, root, scale));
}

/**
 * 展開整個 session 為以「拍」為時間軸的事件列表(純資料,不碰音訊):
 * count-in(startRoot triad,gapBeats 拍)→ run → gap(前半 current triad、
 * 後半 next-key triad,新 key 和弦多拉長一拍)→ … → 最後一個 run 之後無 gap(SPEC 2.3)。
 */
export function buildSessionTimeline(params: SessionParams): SessionTimeline {
  const { scale, pattern, startRoot, topRoot, gapBeats } = params;
  if (pattern.length === 0) throw new Error('pattern 不可為空');
  const roots = buildRootSequence(startRoot, topRoot);
  const events: TimelineEvent[] = [];
  let beat = 0;

  events.push({
    kind: 'triad',
    atBeat: 0,
    beats: gapBeats,
    midis: buildTriad(startRoot, scale),
    role: 'countIn',
    runIndex: 0,
    root: startRoot,
  });
  beat += gapBeats;

  for (let i = 0; i < roots.length; i++) {
    const root = roots[i];
    for (let noteIdx = 0; noteIdx < pattern.length; noteIdx++) {
      const note = pattern[noteIdx];
      events.push({
        kind: 'note',
        atBeat: beat,
        beats: note.beats,
        midi: degreeToMidi(note.degree, root, scale),
        runIndex: i,
        indexInRun: noteIdx,
        root,
      });
      beat += note.beats;
    }
    if (i < roots.length - 1) {
      const half = gapBeats / 2;
      events.push({
        kind: 'triad',
        atBeat: beat,
        beats: half,
        midis: buildTriad(root, scale),
        role: 'gapCurrent',
        runIndex: i + 1,
        root,
      });
      // 換 key 的和弦(下一個 key 的 triad)多拉長一拍,給演唱者更多換氣/定調時間
      events.push({
        kind: 'triad',
        atBeat: beat + half,
        beats: half + 1,
        midis: buildTriad(roots[i + 1], scale),
        role: 'gapNext',
        runIndex: i + 1,
        root: roots[i + 1],
      });
      beat += gapBeats + 1;
    }
  }

  return { events, totalBeats: beat, roots, runCount: roots.length };
}
