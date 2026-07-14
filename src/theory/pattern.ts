export type Note = {
  degree: number; // 複合級數,可為任意整數
  beats: number; // 時值,單位=四分音符拍數
};

export type Pattern = {
  id: string;
  name: string;
  notes: Note[];
};

/** 合法整數(允許負號,不允許小數/亂碼);"-1" 是合法 degree */
const INT_RE = /^-?\d+$/;
/** beats 允許正小數,如 0.5 */
const BEATS_RE = /^\d+(\.\d+)?$/;

/**
 * 解析 Pattern DSL(SPEC 1.5):音符以空白分隔,token 為
 * `<degree>` 或 `<degree>:<beats>`,beats 省略時為 1。
 * 非法輸入一律 throw(呼叫端負責 catch,不得讓它冒泡成 crash)。
 */
export function parsePatternDsl(dsl: string): Note[] {
  const tokens = dsl.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error('Pattern DSL 不可為空');
  }
  return tokens.map((token) => {
    const parts = token.split(':');
    if (parts.length > 2) {
      throw new Error(`非法 token「${token}」:最多一個冒號`);
    }
    const [degreeStr, beatsStr] = parts;
    if (!INT_RE.test(degreeStr)) {
      throw new Error(`非法 degree「${degreeStr}」:必須為整數(分隔符用空白,不可用 -)`);
    }
    const degree = parseInt(degreeStr, 10);
    let beats = 1;
    if (beatsStr !== undefined) {
      if (!BEATS_RE.test(beatsStr)) {
        throw new Error(`非法 beats「${beatsStr}」:必須為正數`);
      }
      beats = parseFloat(beatsStr);
      if (beats <= 0) {
        throw new Error(`非法 beats「${beatsStr}」:必須 > 0`);
      }
    }
    return { degree, beats };
  });
}

/** Note[] → DSL 字串(round-trip 用)。beats = 1 時省略 */
export function patternToDsl(notes: Note[]): string {
  return notes
    .map((n) => (n.beats === 1 ? `${n.degree}` : `${n.degree}:${n.beats}`))
    .join(' ');
}

/** 內建音型庫(SPEC 1.6,DSL 以表列為準) */
export const PATTERNS: Array<Pattern & { dsl: string }> = [
  { id: 'p5-x1',  name: '五度上下行 ×1', dsl: '1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x2',  name: '五度上下行 ×2', dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x3',  name: '五度上下行 ×3', dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },

  { id: 'arp-x1', name: '琶音 ×1', dsl: '1 3 5 3 1' },
  { id: 'arp-x2', name: '琶音 ×2', dsl: '1 3 5 3 1 3 5 3 1' },
  { id: 'arp-x3', name: '琶音 ×3', dsl: '1 3 5 3 1 3 5 3 1 3 5 3 1' },

  { id: 'oct-rep4', name: '八度頂音重複 ×4', dsl: '1 3 5 8 8 8 8 5 3 1' },
  { id: 'oct-hold', name: '八度頂音長音',     dsl: '1 3 5 8:3 8:3 8 5 3 1' },
  { id: 'oct-rep7', name: '八度頂音重複 ×7', dsl: '1 3 5 8 8 8 8 8 8 8 5 3 1' },

  { id: 'fifth-lhl', name: '一五一(低高低)', dsl: '1 5 1' },
  { id: 'unison-x3', name: '同音三連',         dsl: '1 1 1' },

  { id: 'ext-13', name: '延伸琶音音階', dsl: '1 3 5 8 10 12 11 9 7 5 4 2 1' },
].map((p) => ({ ...p, notes: parsePatternDsl(p.dsl) }));
