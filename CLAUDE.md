# 聲樂音階練習 App(vocal-warmup-piano)

## 目標(一句話)
純前端 PWA:以取樣鋼琴音色播放聲樂練習音型,自動半音移調(上行至上限後下行回起始音即停止),部署於 GitHub Pages,iPhone / Android 加入主畫面後可離線使用。

完整規格見 [docs/SPEC.md](docs/SPEC.md)。每輪開工先讀本檔與 NOTES.md。

## 工作模式:milestone-gated(最高優先規則)
**完成一個 milestone 後停下等驗收,不得自行推進到下一個 milestone。** 里程碑定義與驗收條件見 SPEC Section 6(M1 音訊核心 → M2 Session 引擎 → M3 UI 與參數 → M4 PWA 與離線 → M5 iOS 實機)。

## 非目標(SPEC Section 0,明確排除,禁止 scope creep)
- 不做錄音、不做音準偵測 / pitch detection
- 不做多人、不做帳號、不做雲端同步
- 不做節拍器獨立模式
- 不做 A4 基準頻率調整(固定 A4 = 440 Hz)
- 不做樂譜顯示 / 五線譜渲染
- 不做 MIDI 輸入輸出

## 已知風險 / 陷阱清單(SPEC Section 7,完整照錄)
這些是「不知道就會 debug 三小時」的項目:

1. **`-` 不可作為 pattern 分隔符** — 會與負數級數衝突。用空白。
2. **`%` 運算子對負數的行為** — JS 的 `-1 % 7 === -1`,不是 6。degreeToSemitone 必須用 `((x % 7) + 7) % 7`。
3. **iOS 靜音開關** — 見 SPEC 3.4.2。必須在首次手勢播放一段無聲 `<audio playsinline>` 設定 audio session,否則靜音模式下完全無聲。這是最常見的「app 沒聲音」false bug。
4. **GitHub Pages 子路徑** — 絕對路徑資產會 404。Vite `base: './'`。
5. **Service Worker 沒 cache 音檔** — 離線時 app 開得起來但完全無聲,是最尷尬的失敗模式。
6. **`setTimeout` 排程** — 手機上必然 drift。用 Tone.Transport。
7. **topRoot 是根音不是最高音** — 使用者若不看「本次最高演唱音」提示,設 topRoot=C5 + 八度音型 = 實際唱到 C6。這正是 SPEC 2.6 即時音域回饋存在的理由,不可省略。
8. **Wake Lock 在 visibilitychange 後失效** — 需監聽並重新 request。

## 常用指令
- `npm run dev` — Vite dev server
- `npm run test` — Vitest(單次執行)
- `npm run build` — tsc 檢查 + vite build
