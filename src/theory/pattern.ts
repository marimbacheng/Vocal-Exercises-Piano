export type Note = {
  degree: number; // 複合級數,可為任意整數(rest 時固定為 0、不發聲)
  beats: number; // 時值,單位=四分音符拍數
  rest?: boolean; // 休止符:佔時間但不發聲(DSL 用「0」表示,同簡譜慣例)
};

export type Pattern = {
  id: string;
  name: string;
  notes: Note[];
  /** 半速三連音音型的換 key 間隔樣式(見 plan.ts):
   *  'both' = 當前調 + 新調兩個提示和弦,各佔一整拍(2 四分拍);
   *  'nextOnly' = 只放新調和弦一整拍。
   *  未設 = 一般音型的標準間隔(當前調 gapBeats/2 拍 + 新調 gapBeats/2+1 拍)。 */
  tripletGap?: 'both' | 'nextOnly';
};

/** 合法整數(允許負號,不允許小數/亂碼);"-1" 是合法 degree */
const INT_RE = /^-?\d+$/;
/** beats 允許正小數,如 0.5 */
const BEATS_RE = /^\d+(\.\d+)?$/;

/**
 * 解析 Pattern DSL(SPEC 1.5):音符以空白分隔,token 為
 * `<degree>` 或 `<degree>:<beats>`,beats 省略時為 1。
 * degree 為 `0` 代表休止符(佔時間、不發聲,同簡譜慣例);其餘為複合級數。
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
    // degree 0 = 休止符(簡譜慣例):佔時間但不發聲。degree 固定 0,標記 rest。
    if (degree === 0) return { degree: 0, beats, rest: true };
    return { degree, beats };
  });
}

/** Note[] → DSL 字串(round-trip 用)。beats = 1 時省略 */
export function patternToDsl(notes: Note[]): string {
  return notes
    .map((n) => (n.beats === 1 ? `${n.degree}` : `${n.degree}:${n.beats}`))
    .join(' ');
}

/** 內建音型庫(SPEC 1.6,DSL 以表列為準)。
 *  三連音系列(tripletGap:'both'):半速三連音、每音 2/3 拍、長音 :2,末音主音撐前兩顆
 *  (1:1.33333),第三顆與換 key 由 plan.ts 補「當前調三和弦(2/3 拍)+ 新調三和弦一整拍」。 */
const PATTERN_SOURCE: Array<Omit<Pattern, 'notes'> & { dsl: string }> = [
  // 五度順階
  { id: 'p5-x1',  name: '五度順階 - 基本',     dsl: '1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x2',  name: '五度順階 - 重複兩次', dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x3',  name: '五度順階 - 重複三次', dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },

  // 五度琶音
  { id: 'arp-x1', name: '五度琶音 - 基本',     dsl: '1 3 5 3 1' },
  { id: 'arp-x2', name: '五度琶音 - 重複兩次', dsl: '1 3 5 3 1 3 5 3 1' },

  // 跳音(三連音系列)
  { id: 'fifth-lhl', name: '五度跳', tripletGap: 'both', dsl: '1:2 5:2 1:1.33333' },
  { id: 'unison-x3', name: '八度跳', tripletGap: 'both', dsl: '1:2 8:2 1:1.33333' },

  // 梯形音階(三連音系列,骨架 1-3-5 / 8-8-8 / 8-5-3)
  { id: 'oct-rep4', name: '梯形音階 - 基本', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-hold1', name: '梯形音階 - 高音穩定', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:2 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-hold', name: '梯形音階 - 高音穩定兩次', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:2 8:2 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-rep7', name: '梯形音階 - 高音加強兩次', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-lowrep', name: '梯形音階 - 低音加強', tripletGap: 'both',
    dsl: '1:0.66666 1:0.66666 1:0.66666 1:2 1:0.66666 3:0.66666 5:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },

  // 梯形下行(三連音系列,自八度起下行)
  { id: 'oct-desc', name: '梯形下行', tripletGap: 'both',
    dsl: '8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-desc-rep', name: '梯形下行 - 高音加強', tripletGap: 'both',
    dsl: '8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-desc-hold', name: '梯形下行 - 高音穩定', tripletGap: 'both',
    dsl: '8:2 0:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'oct-desc-leap', name: '梯形下行 - 開頭大跳', tripletGap: 'both',
    dsl: '1:2 8:2 0:0.66666 5:0.66666 3:0.66666 1:1.33333' },

  // 長音階(延伸琶音,三連音系列,骨架 1-3-5 / 8-10-12 / 11-9-7 / 5-4-2 / 1)
  { id: 'ext-13', name: '長音階 - 基本', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 10:0.66666 12:0.66666 11:0.66666 9:0.66666 7:0.66666 5:0.66666 4:0.66666 2:0.66666 1:1.33333' },
  { id: 'ext-13-rep', name: '長音階 - 高音加強', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 10:0.66666 12:0.66666 12:0.66666 12:0.66666 12:0.66666 11:0.66666 9:0.66666 7:0.66666 5:0.66666 4:0.66666 2:0.66666 1:1.33333' },
  { id: 'ext-13-hold', name: '長音階 - 高音穩定', tripletGap: 'both',
    dsl: '1:0.66666 3:0.66666 5:0.66666 8:0.66666 10:0.66666 12:0.66666 12:2 12:2 11:0.66666 9:0.66666 7:0.66666 5:0.66666 4:0.66666 2:0.66666 1:1.33333' },

  // 折返音階(高低交替琶音,三連音系列)
  { id: 'fold', name: '折返音階 - 基本', tripletGap: 'both',
    dsl: '1:0.66666 5:0.66666 3:0.66666 8:0.66666 5:0.66666 3:0.66666 1:0.66666 5:0.66666 3:0.66666 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
  { id: 'fold-hold', name: '折返音階 - 高音穩定', tripletGap: 'both',
    dsl: '1:0.66666 5:0.66666 3:0.66666 8:0.66666 5:0.66666 3:0.66666 1:0.66666 5:0.66666 3:0.66666 8:2 8:0.66666 5:0.66666 3:0.66666 1:1.33333' },
];

export const PATTERNS: Array<Pattern & { dsl: string }> = PATTERN_SOURCE.map(
  (p) => ({ ...p, notes: parsePatternDsl(p.dsl) })
);
