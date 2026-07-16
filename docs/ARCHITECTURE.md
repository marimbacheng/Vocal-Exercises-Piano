# 架構 · ARCHITECTURE

Vocal Exercises Piano — 純前端 PWA,取樣鋼琴播放聲樂練習音型,自動半音移調,可離線。
無後端、無帳號、無網路請求(取樣檔隨 app 一起部署)。

## 分層(由內而外,依賴單向朝內)

```
theory/   純函式,零依賴(不 import Tone)——可在 node 測試環境跑
  └─ session/  以 theory 建構 session 時間軸 + 純邏輯(range/params 也屬此層)
       └─ audio/ + platform/  Tone.js 與瀏覽器 API 封裝
            └─ ui/  DOM 組裝與事件接線
                 └─ main.ts  進入點
```

**關鍵原則:純邏輯與音訊隔離。** `theory/`、`session/plan.ts`、`session/range.ts`、`state/params.ts` 完全不碰 Tone.js 或 Web Audio,因此能被 Vitest(node 環境)直接測試。音訊只在 `audio/`、`platform/`、`session/player.ts`、`ui/` 出現。

## 模組職責

| 檔案 | 職責 |
|---|---|
| `theory/scale.ts` | `Scale` 型別 + `SCALES`(major / natural-minor / harmonic-minor)。UI 只用 major,其餘資料保留供理論測試。 |
| `theory/degree.ts` | `degreeToSemitone` / `degreeToMidi`。複合級數↔半音。負數取模用 `((x%7)+7)%7`。 |
| `theory/pattern.ts` | `Note`(含 `rest?`)/`Pattern`(含 `tripletGap?`)型別、`parsePatternDsl`/`patternToDsl`、`PATTERN_SOURCE` → 內建 `PATTERNS`(21 個)。DSL 空白分隔,`degree` 或 `degree:beats`;**`0` = 休止符**。 |
| `theory/note-name.ts` | `midiToName`(C4=60)、`degreeToSolfege`(首調唱名 Do–Ti)、`degreeToJianpu`(簡譜數字 + 八度組合點)。 |
| `session/plan.ts` | `buildRootSequence`(半音上下行)、`buildTriad`、`buildSessionTimeline`——把整個 session 展開成以「拍」為軸的純資料事件列表(count-in / note / gap triad)。休止符只推進拍數不排事件;換 key 間隔依 `tripletGap` 分支。 |
| `session/range.ts` | `computeSungRange`(SPEC 2.6 即時音域,**排除休止符**)、`checkSungRange`(超取樣器音域→警告)。 |
| `session/player.ts` | `SessionPlayer`:把 timeline 排上 `Tone.Transport`。狀態機 idle→countIn→playing⇄gap→(paused)→finished。start/pause/resume/stop。 |
| `state/params.ts` | `AppParams`、`DEFAULT_PARAMS`、`PARAM_LIMITS`(bpm 80–130)、`FIXED_GAP_BEATS(2)`、`sanitizeParams`(強制 scaleId=major、gapBeats=2)、localStorage 讀寫(key `v2`)。 |
| `audio/player.ts` | `loadSampler`(Salamander mp3)、`ensureAudioRunning`(Tone.start)、`onAudioContextStateChange`(中斷偵測)。 |
| `audio/sampler-range.ts` | 取樣器音域常數(C2–C6)。獨立成無依賴模組,讓 range 純邏輯不必 import Tone。 |
| `platform/ios-audio.ts` | `unlockAudioSession`——首次手勢播放循環無聲 WAV,設定 iOS audio session(靜音開關發聲)。 |
| `platform/wake-lock.ts` | `requestWakeLock`/`releaseWakeLock`——session 中保持螢幕喚醒,visibilitychange 重新 request。 |
| `ui/app.ts` | `mountApp`:innerHTML 組裝 + 全部事件接線 + 音高輪廓渲染。單一大檔,無框架。 |
| `main.ts` | import CSS,呼叫 mountApp。 |

## 資料流(一次播放)

1. UI 讀 `params`(localStorage)→ `makeSessionParams()` 組出 `SessionParams`。
2. `buildSessionTimeline(params)` → 純資料事件列表(不含音訊)。
3. `SessionPlayer.start(params, bpm)` 內部 `scheduleAndStart(0)`:把每個事件用 ticks 排上 `Tone.Transport`(單一排程來源,無 drift)。
4. Transport 回呼觸發 `onStateChange` / `onRunChange` / `onNote(midi, indexInRun)` → UI 更新顯示面板、音高輪廓高亮。

## 音訊時值

- UI 速度為**二分音符 BPM**(range 80–130);`player` 內 `quarterBpm = bpm × 2` 才是四分音符速度。
- pattern 的 `beats` 以四分音符計;`secondsPerBeat = 60 / quarterBpm`。
- **「一整拍」(使用者感知的二分音符)= 2 個四分拍 = `beats: 2`**。所有和弦長度以此換算。
- **半速三連音**:每顆 `0.66666`(2/3 四分拍),三顆一組 = 2 四分拍 = 一整拍;長音寫 `:2`。
- 全部音符排在 Transport ticks 上,**禁用 setTimeout**(手機 drift)。

## 換 key 間隔(gap)

兩種樣式,由 pattern 的 `tripletGap` 決定,`buildSessionTimeline` 分支:

| 樣式 | 用於 | 內容 |
|---|---|---|
| 未設(標準) | 五度順階 / 五度琶音 | 當前調 triad `gapBeats/2`(=1 拍)+ 新調 triad `gapBeats/2+1`(=2 拍) |
| `'both'` | 全部三連音音型 | 當前調 triad `0.66666`(補最後一組三連音第三顆)+ 新調 triad `2`(一整拍) |
| `'nextOnly'` | 目前無音型使用(保留、有測試) | 只放新調 triad `2` |

三連音音型的 pattern 末音為 `1:1.33333`(主音撐前兩顆),第三顆由 gap 的當前調和弦補滿。
`player` 的 `gap` 狀態由 `gapCurrent` **或** `gapNext` 觸發(單和弦樣式只有 gapNext)。

## 顯示面板(音高輪廓 + 唱名)

- `renderContour()` 依目前音型畫點:x=音序、y=音高(高在上)。**休止符不畫點**(留空隙),但 `data-i` 沿用原始索引,
  才能與 `onNote` 的 `indexInRun` 對齊。`highlightContour(idx)` 高亮當前發聲點;非播放時清除。
- `now-note` 顯示**首調唱名 / 簡譜**(如 `Mi / 3`),由 `pattern[indexInRun].degree` 換算,非絕對音名。
  拆成 `.solfege`(固定寬 3.2ch 置中)+ `.jianpu`,避免 Sol/Do 字寬差造成位移。

## PWA / 離線

`vite-plugin-pwa`(generateSW,`registerType: 'autoUpdate'`)。`workbox.globPatterns` 含 `mp3`,precache 全部 17 個取樣檔 + JS/CSS/圖示(共 29 entries)。`base: './'` 讓子路徑部署資產走相對路徑。

**能離線的三個理由**:①純前端無後端、零 API;②SW 在首次連網載入時把所有產物 precache;③鋼琴音色是隨 app 部署的 mp3、一併被 cache。
前提:**第一次必須有網路**才能安裝 SW 並下載資源。

## 對外中繼資料(index.html)

`<title>` / `apple-mobile-web-app-title`(iOS 加主畫面預設名)/ Open Graph(`og:title` 等,控制連結預覽名稱)/ manifest `name`·`short_name` **全部為 `Vocal Exercises Piano`**;description 為英文。改動見 DECISIONS「對外呈現」。

延伸:規格見 [SPEC.md](SPEC.md);決策理由見 [DECISIONS.md](DECISIONS.md);部署見 [DEPLOYMENT.md](DEPLOYMENT.md)。
