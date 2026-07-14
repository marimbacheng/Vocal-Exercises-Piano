export type Note = {
  degree: number; // 複合級數,可為任意整數
  beats: number; // 時值,單位=四分音符拍數
};

export type Pattern = {
  id: string;
  name: string;
  notes: Note[];
  /** 換 key 間隔只放「一整拍的新調提示和弦」(無當前調和弦);見 plan.ts。
   *  ext-13 不設此旗標,沿用標準兩段和弦間隔以取得類似「琶音 ×1」的結尾和弦聽感。 */
  singleChordGap?: boolean;
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

  // 八度頂音重複系列:三連音 1/2 倍速(每音 2/3 拍,骨架 1-3-5 / 8-8-8 / 8-5-3),
  // 結尾長短收束(1:4/3 拍 + 1:2/3 拍);升 key 由 triplet 旗標交給 plan.ts
  {
    id: 'oct-rep4',
    name: '八度頂音重複 ×4',
    singleChordGap: true,
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333 1:0.66666',
  },
  {
    id: 'oct-hold',
    name: '八度頂音長音',
    singleChordGap: true,
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:2 8:2 8:0.66666 5:0.66666 3:0.66666 1:1.33333 1:0.66666',
  },
  {
    id: 'oct-rep7',
    name: '八度頂音重複 ×7',
    singleChordGap: true,
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333 1:0.66666',
  },

  // 五度跳 / 八度大跳:三連音 1/2 倍速。概念 1-- 5-- 1-1(每音held 佔一個三連音組=2 拍,結尾長短)
  { id: 'fifth-lhl', name: '五度跳',   singleChordGap: true, dsl: '1:2 5:2 1:1.33333 1:0.66666' },
  { id: 'unison-x3', name: '八度大跳', singleChordGap: true, dsl: '1:2 8:2 1:1.33333 1:0.66666' },

  // 延伸琶音音階,三連音 1/2 倍速(每音 2/3 拍)。第 4 拍三連音第 3 顆回到當前調主音(1)收束;
  // 換 key 沿用標準兩段和弦間隔(當前調 1-3-5 + 新調 1-3-5),結尾和弦聽感類似「琶音 ×1」
  {
    id: 'ext-13',
    name: '延伸琶音音階',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 10:0.66666 12:0.66666 11:0.66666 9:0.66666 7:0.66666 5:0.66666 4:0.66666 1:0.66666',
  },
].map((p) => ({ ...p, notes: parsePatternDsl(p.dsl) }));
