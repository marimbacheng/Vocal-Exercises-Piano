# Vocal Exercises Piano

## 目標(一句話)
純前端 PWA:取樣鋼琴音色播放聲樂練習音型,自動半音移調(上行至上限再下行回起始音),部署於 GitHub Pages,iPhone/Android 加主畫面後可離線使用。已上線:https://marimbacheng.github.io/Vocal-Exercises-Piano/

## 技術棧
Vite + TypeScript(strict)+ Vitest + Tone.js v15 + vite-plugin-pwa。vanilla TS(無框架)。`base: './'`。node 由 Homebrew 裝於 `/usr/local`(指令前需 `export PATH="/usr/local/bin:$PATH"`)。

## 目錄結構
```
src/theory/    純函式:音階/級數/音型 DSL/音名(零依賴,可 node 測試)
src/session/   plan(session 時間軸)、range(音域)、player(Tone 排程+狀態機)
src/state/     params(參數 + localStorage,含 sanitize)
src/audio/     sampler 載入、Tone 啟動、context 中斷偵測
src/platform/  ios-audio(靜音 unlock)、wake-lock
src/ui/app.ts  DOM 組裝 + 事件接線 + 音高輪廓(單一大檔)
docs/          SPEC / ARCHITECTURE / DECISIONS / DEPLOYMENT
```

## 關鍵慣例(不知道會踩坑)
- **純邏輯不 import Tone**:theory/、session/plan、range、params 保持零音訊依賴,才能 node 測試。
- **音符只排在 `Tone.Transport` ticks 上,禁用 setTimeout**(手機 drift)。
- **速度是二分音符 BPM**:player 內 `quarterBpm = bpm × 2` 才是四分音符。
- **degreeToSemitone 負數取模**用 `((x%7)+7)%7`(JS `-1%7===-1`)。
- **pattern DSL 用空白分隔**(`-` 保留給負數級數);`degree` 或 `degree:beats`。
- **SW 必須 precache 全部 mp3**,否則離線無聲。
- 只用大調;`SCALES` 保留三音階資料供理論測試,UI 無選擇器。
- 改動流程:`npm run test` 綠 + `npm run build` 乾淨 + 瀏覽器實測 → commit + push(Actions 自動部署)。

## 常用指令
- `npm run dev` — dev server(5173)
- `npm run test` — Vitest 單次執行
- `npm run build` — tsc 檢查 + vite build

## 延伸文件(需要細節時才讀,平時不必載入)
- [docs/SPEC.md](docs/SPEC.md) — 完整規格(名詞、資料模型、驗收條件、陷阱清單)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 模組職責、資料流、分層依賴。**要改架構或加模組前讀。**
- [docs/DECISIONS.md](docs/DECISIONS.md) — 為什麼這樣選、排除了什麼、bug 修法。**動音訊時值 / iOS / 速度單位前必讀。**
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — CI/CD、rollback、上線後驗證、首次 push 的坑。**部署或發佈前讀。**
- docs/STATE.md — 個人工作狀態(未進 repo);當前完成度、已知問題、待辦。
