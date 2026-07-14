# 聲樂音階練習 App — 實作任務書

> 交付對象:Claude Code
> 版本:v1.0 (draft)
> 標記 ⚠️ 者為預設值,需求方可覆寫

---

## Section 0 — 目標與非目標

### 目標
一個純前端的 PWA,以取樣鋼琴音色播放聲樂練習音型,自動半音移調(上行至上限後下行回起始音即停止),部署於 GitHub Pages,可在 iPhone / Android 加入主畫面後離線使用。

### 非目標(明確排除,禁止 scope creep)
- 不做錄音、不做音準偵測 / pitch detection
- 不做多人、不做帳號、不做雲端同步
- 不做節拍器獨立模式
- 不做 A4 基準頻率調整(固定 A4 = 440 Hz)
- 不做樂譜顯示 / 五線譜渲染
- 不做 MIDI 輸入輸出

### 既有專案關係
本專案為**獨立新 repo**,不併入 `pitch-piano`。可參考其 GitHub Pages 相對路徑部署經驗,但不共用程式碼。

---

## Section 1 — 名詞定義與資料模型

### 1.1 核心名詞

| 名詞 | 定義 |
|---|---|
| **MIDI note** | 內部唯一的音高單位(整數)。C4 = 60, A4 = 69。所有運算以此為準,僅在 UI 邊界轉為音名。 |
| **Root(根音 / key)** | 音型的第 1 級所在的音高(MIDI note)。移調 = 改變 root。 |
| **Scale** | 音階。定義為「從 root 起算的半音位移陣列」,長度 7。 |
| **Degree(級數)** | 音型中的音,以複合級數整數表示(見 1.3)。 |
| **Pattern(音型)** | 一串 degree + 時值,描述一次演唱的旋律輪廓。與 scale 正交。 |
| **Run(單次)** | 在某一個 root 上完整演唱一次 pattern。 |
| **Gap** | 兩個 run 之間的間隔,含吸氣時間與提示和弦。 |
| **Session** | 一次完整流程:startRoot → 半音上行至 topRoot → 半音下行回 startRoot → 停止。 |

### 1.2 Scale

```ts
type Scale = {
  id: string;
  name: string;
  /** 從 root 起算的半音位移,長度必為 7 */
  intervals: [number, number, number, number, number, number, number];
};

const SCALES: Scale[] = [
  { id: 'major',            name: '大調 (Major)',        intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'natural-minor',    name: '自然小調',            intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'harmonic-minor',   name: '和聲小調',            intervals: [0, 2, 3, 5, 7, 8, 11] },
];
```

> 預設只實作 major。其餘為資料擴充,不需額外程式碼。

### 1.3 Degree — 複合級數(**關鍵設計**)

Degree 是一個**可為任意整數**的值,不限於 1–7。

```ts
/**
 * 將複合級數轉換為相對 root 的半音數。
 * d = 1..7  → 基準八度
 * d = 8     → 高八度的第 1 級 (root + 12)
 * d = 9..14 → 高八度的第 2..7 級
 * d = 0     → 低八度的第 7 級
 * d = -1    → 低八度的第 6 級
 */
function degreeToSemitone(d: number, scale: Scale): number {
  const octaveOffset = Math.floor((d - 1) / 7);
  const degreeInScale = ((((d - 1) % 7) + 7) % 7);  // 0-indexed, 處理負數
  return scale.intervals[degreeInScale] + 12 * octaveOffset;
}

function degreeToMidi(d: number, root: number, scale: Scale): number {
  return root + degreeToSemitone(d, scale);
}
```

**驗收測項(必須通過):**

| degree | scale=major | 期望半音位移 |
|---|---|---|
| 1 | | 0 |
| 5 | | 7 |
| 8 | | 12 |
| 10 | | 16 |
| 12 | | 19 |
| 7 | | 11 |
| 0 | | -1 |
| -1 | | -3 |

### 1.4 Pattern

```ts
type Note = {
  degree: number;      // 複合級數
  beats: number;       // 時值,單位=四分音符拍數。預設 1
};

type Pattern = {
  id: string;
  name: string;
  notes: Note[];
};
```

### 1.5 Pattern DSL(字串輸入格式)

供 pattern 定義檔與未來的自訂音型 UI 使用。

- **音符之間以空白分隔**(不可用 `-`,`-` 保留給負數級數)
- 每個 token:`<degree>` 或 `<degree>:<beats>`
- `beats` 省略時預設為 1
- `beats` 可為小數(如 `0.5` = 八分音符)

範例:
```
"1 3 5 8:3 8:3 8 5 3 1"
```

Parser 需拒絕:非整數 degree、beats <= 0、空字串。

### 1.6 內建音型庫

```ts
const PATTERNS: Pattern[] = [
  { id: 'p5-x1',  name: '五度上下行 ×1',   dsl: '1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x2',  name: '五度上下行 ×2',   dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },
  { id: 'p5-x3',  name: '五度上下行 ×3',   dsl: '1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1 2 3 4 5 4 3 2 1' },

  { id: 'arp-x1', name: '琶音 ×1',          dsl: '1 3 5 3 1' },
  { id: 'arp-x2', name: '琶音 ×2',          dsl: '1 3 5 3 1 3 5 3 1' },
  { id: 'arp-x3', name: '琶音 ×3',          dsl: '1 3 5 3 1 3 5 3 1 3 5 3 1' },

  { id: 'oct-rep4',   name: '八度頂音重複 ×4',  dsl: '1 3 5 8 8 8 8 5 3 1' },
  { id: 'oct-hold',   name: '八度頂音長音',      dsl: '1 3 5 8:3 8:3 8 5 3 1' },
  { id: 'oct-rep7',   name: '八度頂音重複 ×7',  dsl: '1 3 5 8 8 8 8 8 8 8 5 3 1' },

  { id: 'fifth-lhl',  name: '一五一(低高低)',   dsl: '1 5 1' },
  { id: 'unison-x3',  name: '同音三連',          dsl: '1 1 1' },

  { id: 'ext-13',     name: '延伸琶音音階',      dsl: '1 3 5 8 10 12 11 9 7 5 4 2 1' },
];
```

> ⚠️ **`oct-hold` 待確認**:原始輸入為 `1-3-5-1-----1-----1-5-3-1`,`-` 同時作為分隔符與延長符,無法明確判讀。暫定為 `8:3 8:3 8`(兩個三拍長音 + 一個一拍)。
>
> **註:八度的判讀不是機械規則。** `1 5 1` 的末音為原位 root(低高低),但 `1 3 5 8 ...` 系列中,`5` 之後的 `1` 為高八度 root。判準是旋律輪廓:琶音上行至 5 之後的 `1` 只可能向上,而 `1 5 1` 是對稱的來回。實作時**以此表列的 DSL 為準**,不要試圖從原始 `-` 字串反推。

---

## Section 2 — 功能規格

### 2.1 使用者參數

| 參數 | 型別 | 預設 | 範圍 | 說明 |
|---|---|---|---|---|
| `scaleId` | string | `'major'` | SCALES | 音階 |
| `patternId` | string | `'p5-x1'` | PATTERNS | 音型 |
| `startRoot` | MIDI int | 60 (C4) | 36–84 | 起始根音 |
| `topRoot` | MIDI int | 72 (C5) | 36–84 | 最高根音(**以根音計,非最高演唱音**) |
| `bpm` | number | 80 | 40–180 | **對四分音符** |
| `gapBeats` | number | 2 | 1–4 | 兩 run 之間的間隔拍數 |
| `forceMajorCue` | boolean | false ⚠️ | | 提示和弦是否強制為大三和弦 |

**約束:** `topRoot >= startRoot`。若相等,session 只播放 1 個 run 後結束。

### 2.2 Session 流程

```
startRoot → startRoot+1 → ... → topRoot   (上行)
topRoot-1 → topRoot-2 → ... → startRoot   (下行)
→ 結束
```

注意:`topRoot` 只演唱**一次**(不重複)。總 run 數 = `2 * (topRoot - startRoot) + 1`。

### 2.3 Gap 與提示和弦(**關鍵行為**)

每個 run 結束後、下個 run 開始前,插入長度為 `gapBeats` 拍的 gap。Gap 期間鋼琴演奏:

1. **當前 key 的三和弦**(剛唱完的 root)
2. **下一個 key 的三和弦**(即將要唱的 root)

目的:讓使用者吸氣,同時聽到調性移動的預告。

**預設實作(gapBeats = 2,已定案):**
- 第 1 拍:current root triad
- 第 2 拍:next root triad

`gapBeats` 仍為可調參數(1–4)。當 `gapBeats = 1` 時,兩個 triad 各佔半拍;當 `gapBeats > 2` 時,兩個 triad 分別置於 gap 的前半與後半。

**Triad 音高:** 取 pattern 所用 scale 的 degree 1, 3, 5(三音同時發聲)。
- `forceMajorCue = false`(預設):跟隨 scale。大調 → 大三和弦;小調 → 小三和弦。
- `forceMajorCue = true`:一律 root, root+4, root+7。

**Session 開頭:** 第一個 run 之前需有一次 count-in,播放 `startRoot` 的 triad(長度 `gapBeats` 拍),讓使用者抓到起音與速度。

**Session 結尾:** 最後一個 run(回到 startRoot)之後**不再有 gap**,直接結束。

### 2.4 狀態機

```
idle
 └─(play)→ countIn
            └→ playing ──(run 結束且非最後一個)→ gap ──→ playing
                 │                                          
                 └─(最後一個 run 結束)→ finished ──(reset)→ idle

任何狀態 ──(pause)→ paused ──(resume)→ 回到原狀態
任何狀態 ──(stop)→ idle
```

- **參數變更:** 非 `idle` 狀態下修改參數 → 不即時生效,需 stop 後重新開始。UI 應將參數控制項在播放中設為 disabled(避免使用者誤以為會即時套用)。
- **pause:** 立即靜音並暫停 transport,resume 從當前 run 的開頭重新開始(不從半個 run 中間接續,那對練唱沒有意義)。

### 2.5 邊界條件(必須明確處理,不可 crash)

| 情境 | 期望行為 |
|---|---|
| `topRoot < startRoot` | UI 阻擋(slider 連動),不可進入 playing |
| `topRoot == startRoot` | 合法。1 個 run。 |
| 音型最高音超出取樣器音域 | UI 即時警告,play 按鈕 disabled |
| 音型最低音低於取樣器音域 | 同上 |
| 演唱音超出 MIDI 0–127 | 同上 |
| 播放中切換分頁 / 鎖屏 | AudioContext 可能被 suspend → 見 Section 3.5 |

### 2.6 即時回饋(**需求方明確要求**)

UI 必須即時計算並顯示:

- **本次 session 會唱到的最高音** = `midiToName(topRoot + degreeToSemitone(max(pattern.degrees), scale))`
- **本次 session 會唱到的最低音** = `midiToName(startRoot + degreeToSemitone(min(pattern.degrees), scale))`

這兩個值在 `scaleId` / `patternId` / `startRoot` / `topRoot` 任一改變時立即更新。這是防止使用者誤設音域的主要防線。

同時顯示:
- 當前 run 的 root(如 `D4`)
- 當前正在發聲的音(如 `F#4`)
- 進度(`第 5 / 25 次`,以及上行 ↑ / 下行 ↓ 指示)

---

## Section 3 — 音訊技術規格

### 3.1 函式庫

- **Tone.js**(v15+)。使用 `Tone.Sampler` + `Tone.Transport`。
- 禁止使用 `setTimeout` / `setInterval` 排程音符。所有音符必須排在 `Tone.Transport` 或對齊 `audioContext.currentTime` 的 lookahead scheduler 上。手機端 timer drift 會累積到聽得出來。

### 3.2 取樣鋼琴音源

- **音源:** Salamander Grand Piano(Tone.js 官方範例採用之取樣集)
- **授權:** CC BY 3.0 — **必須在 UI 的 About / 頁尾標註出處與授權**
- **取樣策略:** 每小三度取一個樣本(約 12–15 個檔案),涵蓋 A0–C8 中實際需要的範圍(建議 C2–C6 已足夠涵蓋 root 36–84 加上音型的八度延伸)。中間音高由 `Tone.Sampler` 以 playbackRate 內插。
- **格式:** `.mp3`(相容性優先)。目標總大小 < 3 MB。
- **A4 = 440 Hz 固定**,不提供調整。

### 3.3 時值換算

```
secondsPerBeat = 60 / bpm          // beat = 四分音符
noteDuration   = note.beats * secondsPerBeat
```

音符之間為 legato(無間隙)。單音的 release 由 Sampler 自然衰減處理。

### 3.4 iOS 三個必須處理的坑(**不處理就是 app 壞掉**)

1. **AudioContext 必須由使用者手勢啟動。** 首次點擊 Play 時呼叫 `await Tone.start()`,並確認 `Tone.context.state === 'running'` 後才排程。
2. **iOS 靜音實體開關會讓 Web Audio 無聲。** 必須在使用者首次手勢時播放一段極短的無聲 `<audio playsinline>` 元素,以設定 audio session category,否則使用者切到靜音模式會完全聽不到聲音,且誤以為 app 故障。
3. **背景 / 鎖屏會 suspend AudioContext。** 練唱時使用者不會一直碰螢幕 → 必須使用 **Wake Lock API**(`navigator.wakeLock.request('screen')`)在 session 進行中保持螢幕喚醒,session 結束或 pause 時釋放。Wake Lock 在 visibilitychange 後會失效,需重新 request。

### 3.5 中斷復原

若播放中 `Tone.context.state` 變為 `suspended`(來電、切換 app 等),進入 `paused` 狀態並在 UI 明確提示,不要靜默地繼續跑 transport。

---

## Section 4 — UI 規格

### 4.1 佈局(手機直式優先)

```
┌─────────────────────────────┐
│  [ 音階 ▾ ]   [ 音型 ▾ ]     │
├─────────────────────────────┤
│  起始音   C4   [ − ] [ + ]   │
│  最高根音 C5   [ − ] [ + ]   │
│  速度     80   [ ──●── ]     │
│  Gap      2 拍 [ − ] [ + ]   │
├─────────────────────────────┤
│  ⚠ 本次最高演唱音: G5        │
│    本次最低演唱音: C4        │
├─────────────────────────────┤
│         E4  ↑                │  ← 當前 root + 方向
│      ●  G#4                  │  ← 當前發聲音
│      第 5 / 25 次             │
├─────────────────────────────┤
│   [   ▶ 開始   ]  [ ■ 停止 ] │
└─────────────────────────────┘
```

### 4.2 要求

- 主要按鈕(Play / Stop)最小觸控區 **56 × 56 px**,單手拇指可及(置於畫面下緣)
- 起始音 / 最高根音使用 `− / +` 半音步進按鈕(比 slider 精確),長按可連續
- 「本次最高演唱音」超出取樣器音域時,以警示色顯示並 disable Play
- 當前發聲音需有視覺脈動,讓使用者不用盯著也能餘光感知節奏
- 深色模式優先(練唱環境常較暗)
- 參數持久化至 `localStorage`,重開 app 保留上次設定

---

## Section 5 — 部署規格

- **Repo:** 新建,建議名 `vocal-warmup-piano`
- **GitHub Pages:** 由 `main` branch 的 `/docs` 或 GitHub Actions 部署
- **Base path:** app 會位於 `https://<user>.github.io/<repo-name>/` 子路徑下
  - **所有資產路徑必須為相對路徑**(`./assets/...`),不可為 `/assets/...`
  - Vite 需設定 `base: './'`
  - Service Worker 的 `scope` 與註冊路徑同樣必須相對
- **PWA:**
  - `manifest.json`:`display: "standalone"`,192 / 512 px 圖示,`start_url: "./"`
  - `apple-touch-icon` link tag(iOS 不讀 manifest 圖示)
  - `<meta name="apple-mobile-web-app-capable" content="yes">`
- **Service Worker:**
  - 必須 precache **所有鋼琴取樣檔**,否則離線 = 無聲
  - 快取版本化(cache name 帶版本號),部署新版時清舊 cache
- **iOS 安裝說明:** iOS 無 install prompt。首頁需有一段可收合的說明:「Safari → 分享 → 加入主畫面」

---

## Section 6 — 里程碑與驗收條件

採 milestone-gated。**每個 milestone 完成後停下,等待驗收,不得自行推進。**

### M1 — 音訊核心
- [ ] `degreeToSemitone` 通過 Section 1.3 全部驗收測項(寫成單元測試)
- [ ] Pattern DSL parser 通過 round-trip 測試,且能正確拒絕非法輸入
- [ ] 能以 BPM=80 播放 C4 大調 `1 2 3 4 5 4 3 2 1`
- [ ] 用 tuner app 驗證音準誤差 < 5 cents
- **Gate:** 桌機 Chrome 聽起來節奏穩定、音高正確

### M2 — Session 引擎
- [ ] 完整 C4 → C5 → C4 移調循環,共 25 個 run
- [ ] Gap 正確插入,且 gap 內先後播放 current triad → next triad
- [ ] Session 開頭有 count-in triad
- [ ] 最後一個 run 後無多餘 gap,乾淨結束
- **Gate:** 全程無 timing drift,gap 長度聽起來一致

### M3 — UI 與參數
- [ ] 全部參數可調並持久化
- [ ] 「本次最高 / 最低演唱音」即時更新且計算正確
- [ ] 超出音域時 Play 被 disable 並顯示警告
- [ ] 全部 12 個內建音型皆可正常播放
- **Gate:** 桌機瀏覽器完整可用

### M4 — PWA 與離線
- [ ] `manifest.json` + Service Worker 就緒
- [ ] 部署至 GitHub Pages,子路徑下資產全部載入成功(檢查 Network 無 404)
- [ ] **飛航模式下**從主畫面圖示啟動,仍可完整播放一個 session
- **Gate:** 離線可用

### M5 — iOS 實機
- [ ] iPhone Safari「加入主畫面」後啟動正常
- [ ] **實體靜音開關開啟時仍有聲音**
- [ ] Session 進行中螢幕不熄滅(Wake Lock 生效)
- [ ] 來電 / 切換 app 後回來,狀態正確進入 paused 而非亂掉
- **Gate:** 可實際拿來練唱

---

## Section 7 — 已知風險 / 陷阱清單

給實作者的預先警告,這些是「不知道就會 debug 三小時」的項目:

1. **`-` 不可作為 pattern 分隔符** — 會與負數級數衝突。用空白。
2. **`%` 運算子對負數的行為** — JS 的 `-1 % 7 === -1`,不是 6。degreeToSemitone 必須用 `((x % 7) + 7) % 7`。
3. **iOS 靜音開關** — 見 3.4.2。這是最常見的「app 沒聲音」false bug。
4. **GitHub Pages 子路徑** — 絕對路徑資產會 404。Vite `base: './'`。
5. **Service Worker 沒 cache 音檔** — 離線時 app 開得起來但完全無聲,是最尷尬的失敗模式。
6. **`setTimeout` 排程** — 手機上必然 drift。用 Tone.Transport。
7. **topRoot 是根音不是最高音** — 使用者若不看「本次最高演唱音」提示,設 topRoot=C5 + 八度音型 = 實際唱到 C6。這正是 2.6 存在的理由,不可省略。
8. **Wake Lock 在 visibilitychange 後失效** — 需監聽並重新 request。

---

## 附錄 A — 建議技術棧

- Vite + TypeScript + React(或 vanilla TS,此 app 規模不大)
- Tone.js v15+
- Vitest(單元測試,主要測 degreeToSemitone 與 DSL parser)
- `vite-plugin-pwa`(處理 manifest + SW,省去手寫)

## 附錄 B — 待需求方確認事項

### 已定案
- ✅ `fifth-lhl` = `1 5 1`(低高低,末音為原位 root)
- ✅ `oct-hold` = `1 3 5 8:3 8:3 8 5 3 1`
- ✅ `gapBeats` 預設 = 2

### 仍待確認(不阻擋 M1–M4)
1. `forceMajorCue` 預設 false(提示和弦跟隨所選音階)是否符合原意?

> 註:此項僅在實作小調音階時才會產生實際差異。預設音階庫只啟用 major,故不阻擋任何 milestone,可延後至 M3 決定。
