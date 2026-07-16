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
- **速度是二分音符 BPM**(UI range 80–130):player 內 `quarterBpm = bpm × 2` 才是四分音符。
  → **「一整拍」= 2 個四分拍 = `beats: 2`**。算和弦/長音長度前先想清楚這個。
- **pattern DSL**:空白分隔(`-` 保留給負數級數);`degree` 或 `degree:beats`;**`0` = 休止符**(簡譜慣例,不發聲、不計音域)。
- **三連音系列一律半速**:每顆 `0.66666`(2/3 拍),三顆=一整拍;長音 `:2`。末音 `1:1.33333`(主音撐前兩顆),
  第三顆與換 key 和弦由 `plan.ts` 依 `tripletGap` 補上(勿寫進 DSL)。
- **degreeToSemitone 負數取模**用 `((x%7)+7)%7`(JS `-1%7===-1`)。
- **SW 必須 precache 全部 mp3**,否則離線無聲。
- 只用大調(`sanitizeParams` 強制);間隔固定 2 拍(`FIXED_GAP_BEATS`);`SCALES` 保留三音階資料供理論測試。
- **音型 id 不可改**(舊 localStorage 會失效),故 id 與顯示名稱不對應是刻意的。
- 改動流程:`npm run test` 綠 + `npm run build` 乾淨 + 瀏覽器實測 → commit + push(Actions 自動部署)。

## 常用指令
- `npm run dev` — dev server(5173)
- `npm run test` — Vitest 單次執行
- `npm run build` — tsc 檢查 + vite build

## 延伸文件(需要細節時才讀,平時不必載入)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 模組職責、資料流、分層依賴、gap 樣式表、音訊時值。
  **要改架構、加模組、動 gap/時值前讀。**
- [docs/DECISIONS.md](docs/DECISIONS.md) — 為什麼這樣選、排除了什麼、14 條已知陷阱。
  **動音訊時值 / 三連音 / 休止符 / iOS / 速度單位前必讀。** 記錄的是現況,被推翻的做法已降級為「落選」——別回頭採用。
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — CI/CD、rollback、上線後驗證、連結預覽與快取。
  **部署、發佈、或處理連結預覽/分享問題前讀。**
- [docs/SPEC.md](docs/SPEC.md) — 原始完整規格(名詞、資料模型、驗收條件)。
  ⚠️ 寫於專案初期,**音型清單/速度範圍/三連音規格已被後續迭代取代**;衝突時以 DECISIONS.md 為準。
- docs/STATE.md — 個人工作狀態(未進 repo);當前完成度、已知問題、待辦。
