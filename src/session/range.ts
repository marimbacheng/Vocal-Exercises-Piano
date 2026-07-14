import { degreeToSemitone } from '../theory/degree.ts';
import type { Scale } from '../theory/scale.ts';
import type { Note } from '../theory/pattern.ts';
import { SAMPLER_MIN_MIDI, SAMPLER_MAX_MIDI } from '../audio/sampler-range.ts';

export type SungRange = {
  /** 本次 session 會唱到的最高音(topRoot + pattern 最大位移;SPEC 2.6) */
  maxMidi: number;
  /** 本次 session 會唱到的最低音(startRoot + pattern 最小位移) */
  minMidi: number;
};

export function computeSungRange(
  pattern: Note[],
  scale: Scale,
  startRoot: number,
  topRoot: number
): SungRange {
  const semis = pattern.map((n) => degreeToSemitone(n.degree, scale));
  return {
    maxMidi: topRoot + Math.max(...semis),
    minMidi: startRoot + Math.min(...semis),
  };
}

export type RangeCheck = {
  ok: boolean;
  /** 給 UI 顯示的警告訊息;ok 時為空陣列 */
  problems: string[];
};

/** SPEC 2.5:超出取樣器音域或 MIDI 0–127 → 警告 + disable Play */
export function checkSungRange(range: SungRange): RangeCheck {
  const problems: string[] = [];
  if (range.maxMidi > 127 || range.minMidi < 0) {
    problems.push('演唱音超出 MIDI 範圍 (0–127)');
  }
  if (range.maxMidi > SAMPLER_MAX_MIDI) {
    problems.push('最高演唱音超出取樣器音域 (C6)');
  }
  if (range.minMidi < SAMPLER_MIN_MIDI) {
    problems.push('最低演唱音低於取樣器音域 (C2)');
  }
  return { ok: problems.length === 0, problems };
}
