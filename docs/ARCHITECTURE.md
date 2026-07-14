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
| `theory/pattern.ts` | `Note`/`Pattern` 型別、`parsePatternDsl`/`patternToDsl`、內建 `PATTERNS`(12 個)。DSL 空白分隔,`degree` 或 `degree:beats`。 |
| `theory/note-name.ts` | `midiToName`(C4=60)。 |
| `session/plan.ts` | `buildRootSequence`(半音上下行)、`buildTriad`、`buildSessionTimeline`——把整個 session 展開成以「拍」為軸的純資料事件列表(count-in / note / gap triad)。 |
| `session/range.ts` | `computeSungRange`(SPEC 2.6 即時音域)、`checkSungRange`(超取樣器音域→警告)。 |
| `session/player.ts` | `SessionPlayer`:把 timeline 排上 `Tone.Transport`。狀態機 idle→countIn→playing⇄gap→(paused)→finished。start/pause/resume/stop。 |
| `state/params.ts` | `AppParams`、`DEFAULT_PARAMS`、`PARAM_LIMITS`、`sanitizeParams`、localStorage 讀寫。 |
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

- UI 速度為**二分音符 BPM**;`player` 內 `quarterBpm = bpm × 2` 才是四分音符速度。
- pattern 的 `beats` 以四分音符計;`secondsPerBeat = 60 / quarterBpm`。
- 全部音符排在 Transport ticks 上,**禁用 setTimeout**(手機 drift)。

## 顯示面板(音高輪廓)

`ui/app.ts` 的 `renderContour()` 依目前音型畫點:x=音序、y=音高(高在上)。`onNote` 帶 `indexInRun`,`highlightContour(idx)` 高亮當前發聲點。非播放時清除高亮。

## PWA / 離線

`vite-plugin-pwa`(generateSW)。`workbox.globPatterns` 含 `mp3`,precache 全部 17 個取樣檔 + JS/CSS/圖示。`base: './'` 讓子路徑部署資產走相對路徑。

延伸:規格見 [SPEC.md](SPEC.md);決策理由見 [DECISIONS.md](DECISIONS.md);部署見 [DEPLOYMENT.md](DEPLOYMENT.md)。
