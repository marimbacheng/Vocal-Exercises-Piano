# 技術決策 · DECISIONS

紀錄「為什麼這樣選、排除了什麼」——commit message 已有的「做了什麼」不重複。
本專案直接 push 到 `main`、**無 PR**,故引用 commit hash。

Repo: https://github.com/marimbacheng/Vocal-Exercises-Piano

## 架構 / 骨架

- **vanilla TS,不用 React**(`d8b413d`)。app 規模小、無複雜狀態樹,少一層依賴。落選:React——若 UI 複雜度超出預期可再議。
- **純邏輯與音訊隔離**:`theory/`、`session/plan.ts`、`range.ts`、`params.ts` 不 import Tone,才能被 node 環境的 Vitest 測。為此把取樣器音域常數抽成無依賴的 `audio/sampler-range.ts`(`player.ts` re-export 保持相容)。
- **timeline 設計**:`buildSessionTimeline` 先把整個 session 展開成純資料事件列表,音訊層再一次性排上 Transport。單一排程來源 = gap 一致、無累積 drift;事件帶 `runIndex` 供 pause/resume。落選:逐 run 動態排程(手機 timer drift 會累積到聽得出來)。

## 音訊

- **Salamander Grand Piano 取樣**(CC BY 3.0),C2–C6 每小三度 17 檔共 1.2MB。授權要求標註(見下)。
- **Transport ticks 排程,禁用 setTimeout**——手機 timer 必然 drift(SPEC 陷阱 #6)。
- **結尾收尾 bug**(`d8b413d` 前修):session 結尾 `transport.stop()` 歸零 position 後,tick 0 的 count-in 會在同一 lookahead 重放。修法:finished 回呼內先 `cancel(0)` 再 `stop(time)`。
- **pause/resume**:抽出 `scheduleAndStart(fromRunIndex)`,start 與 resume 共用。resume 從當前 run 開頭重排,略過 count-in 與該 run 前的 gap,時間軸 rebase。落選:從半個 run 中間接續(對練唱無意義,SPEC 2.4)。

## iOS(SPEC 3.4 / 3.5)

- **靜音開關發聲**(`ios-audio.ts`):首次手勢建構無聲 WAV(程式生成 blob,不嵌大 base64——base64 220KB 超過工具回傳上限),隱藏 append 到 DOM 後**循環播放**維持 iOS playback session。必須在 handler 任何 await 之前呼叫。
- **Wake Lock bug**(`d93a810`):多個 active 狀態變化併發 `acquire()`,release 執行時 sentinel 仍 null、之後 in-flight 才 resolve → 螢幕鎖洩漏、停止後不釋放。修法:加 `acquiring` 護欄 + await 後若 `want` 已 false 立即釋放。
- **中斷偵測**:`onAudioContextStateChange` 監聽 rawContext;state≠running 且播放中 → 自動 pause + 提示,不靜默空跑。resume 前先 `ensureAudioRunning()` 讓 context 從 suspended 恢復。
- 測試環境假象:自動化瀏覽器分頁非 visible,取得 wake lock 會被 OS 立即釋放(觸發 release 事件),造成 request 計數持續增長——非 bug,實機 visible 分頁不會。

## 使用者調整(部署後迭代)

- **換 key 和弦延長一拍**(`d93a810`):gap 的 next-key triad `beats = gapBeats/2 + 1`,gap 總長 `gapBeats+1`。給演唱者換氣/定調時間。
- **速度改二分音符 BPM**(`d93a810` 起,範圍後改於 `b9e29fe`):UI 顯示值 × 2 = 四分音符 BPM。目前 range 80–200(=四分 160–400)、default 80。storage key 升 `v2` 避免舊四分值被誤讀。**這是目前語意,未還原**——若要 UI 值就是一般 BPM,移除 `player.ts` 的 `× 2` 即可。
- **移除鋼琴音源頁尾**(`d93a810`):CC BY 3.0 **法律要求標註**,不可全刪。改移入預設收合的「音源授權」`<details>`(README 也有),兼顧清爽與合規。
- **暫停可改參數**(`d93a810`):disable 條件由 `isActive()` 改 `isPlaying()`(不含 paused)。暫停中改任一參數 → `dirtyWhilePaused`,繼續時 stop+start 從第一組帶新參數重跑;未改則維持 resume 從當前 run。
- **移除 forceMajorCue、只留大調**:先移功能(`d93a810`),後移音階選擇器 UI(`e4aa6ae`)。`SCALES` 資料仍保留三個音階供 `degree`/`plan` 理論測試,不破壞測試。
- **移除 UI 狀態字**(idle/playing/…,`d93a810`):`now-state` 只顯示 載入中/中斷/錯誤;`errorMsg` 改用獨立變數避免被 refresh 覆蓋。
- **UI 改版:柔和淺藍終端風**(`6a1efc9`):深藍灰底 + 淡藍點綴取代深色綠,中英分區標題。後續(`e4aa6ae`)顯示面板去示波器格線、縮小,改**音高輪廓點陣**(NoteEvent 加 `indexInRun`,onNote 帶序號供高亮)。
- **三連音音型**(`e4aa6ae`):ext-13 分組 `1-3-5 / 8-10-12 / 11-9-7 / 5-4-2 / 1`,每組一拍。用 `beats: 0.33333` 表示 1/3 拍(3×0.33333=0.99999,誤差約十萬分之一拍、聽感不可辨),沿用現有 DSL 不改 parser。落選:parser 加分數 `1/3`(需改 round-trip 測試,收益不成比例)。
- **強制大調、修小調殘留**:UI 移除音階選擇器後(`e4aa6ae`),`sanitizeParams` 仍保留舊 `scaleId`,舊 localStorage 存的小調值會續播小調。改為 `sanitizeParams` 一律回傳 `'major'`,忽略任何存值。`SCALES` 三音階資料仍保留供理論測試。
- **顯示音名改首調唱名 / 簡譜**:`now-note` 由絕對音名(C4)改為當前音在音型中的級數 →「首調唱名 / 簡譜」(如 `Mi / 3`)。新增 `degreeToSolfege`/`degreeToJianpu`(note-name.ts,純函式);簡譜高/低八度用組合附加點 U+0307 / U+0323。`onNote` 由 midi 改查 `pattern[indexInRun].degree`。
- **速度 80–130、間隔固定 2 拍**:`PARAM_LIMITS.bpm.max` 200→130;移除 TEMPO 的「間隔」stepper UI 與事件,`sanitizeParams` 強制 `gapBeats = FIXED_GAP_BEATS(2)`。`buildSessionTimeline` 仍接受任意 gapBeats(純邏輯測試不動)。
- **ext-13 改 1/2 倍速**:每音 `beats` 由 0.33333→0.66666、末音 1→2,每組三連音由一拍變兩拍。整體放慢一半,degree 不變(range 測試不受影響)。
- **三連音音型統一收尾 + 換 key**:`Pattern` 加 `triplet?: boolean`(ext-13、oct-rep4/hold/rep7);`SessionParams` 同步帶旗標。
  - **結尾**收在三連音節奏:一般三連音末音 `1` → `1:0.66666 1:0.33333`(長短,共 1 拍);ext-13 因半速 → `1:1.33333 1:0.66666`(共 2 拍,保留原總長)。
  - **換 key 間隔**:`buildSessionTimeline` 遇 `triplet` 時不放 gapCurrent,只放「一整拍的新調 1-3-5 提示和弦」(`gapNext`, beats=1),取代原本 current+next 兩段和弦。`player` 的 gap 狀態改由 gapCurrent **或** gapNext 觸發(三連音只有 gapNext)。落選:半速 ext-13 用 2 拍間隔——依使用者「一整拍」指示統一 1 拍。
  - **八度頂音重複系列改三連音**:骨架 `1-3-5 / 8-8-8 / 8-5-3 / 1`。×4=4 個頂音(1 組 8-8-8 + 下行起音)、×7=7 個、長音=兩個整拍 8 夾在中間;名稱不變,僅節奏改三連音。
- **全部三連音音型統一 1/2 倍速**(第二輪迭代):每音 2/3 拍(0.66666)、頂音長音 `8:2`、結尾長短 `1:1.33333 1:0.66666`。八度系列、五度跳、八度大跳、ext-13 一致。
- **五度跳 / 八度大跳改三連音半速**:概念 `1-- 5-- 1-1`——每音 held 佔一個三連音組(2 拍)、結尾長短。DSL `1:2 5:2 1:1.33333 1:0.66666`(八度大跳把 5 換 8)。
- **半速三連音換 key 間隔:當前調補第三顆 + 新調一整拍**(`tripletGap` 旗標,取代 `singleChordGap`):pattern 末音主音撐**前兩顆**三連音(`1:1.33333`),第三顆(2/3 拍)交給當前調三和弦(接過去),再接新調三和弦一整拍(2 拍)。當前調和弦剛好補滿最後一組三連音、對齊 grid。
  - `'both'`(八度系列、ext-13、五度跳、八度大跳):當前調 1-3-5(2/3 拍)+ 新調 1-3-5(2 拍),每個 gap 共 2⅔ 拍。
  - `'nextOnly'`(只放新調和弦 2 拍)仍為支援選項、有測試涵蓋,但目前無內建音型使用。
  - 一般音型未設 → 標準間隔不變。`plan.ts` 依旗標分支;`player` gap 狀態由 gapCurrent 或 gapNext 觸發。
  - 落選:當前調和弦也佔 2 拍(2+2)——與最後一組三連音脫節,使用者指正應為「主音撐兩顆 + 和弦補第三顆」。
- **ext-13 結尾定案**:骨架 `1-3-5 / 8-10-12 / 11-9-7 / 5-4-2 / 1:1.33333`,末音主音撐前兩顆收束;第三顆為當前調三和弦(2/3 拍),再接新調三和弦一整拍。八度系列同此收尾形式。
- **PATTERNS 型別**:抽出 `PATTERN_SOURCE`(`Array<Omit<Pattern,'notes'> & {dsl}>`)讓 `tripletGap` 字面值收斂為聯合型別,再 `.map` 補 `notes`。
- **音名顯示固定位置**:`now-note` 拆成 `.solfege`(固定寬 3.2ch 置中)+ `.jianpu`,解決 Sol(3 字母)vs Do/Mi(2 字母)造成「/ 簡譜」位移。
- **音型改名**:同音三連→**八度大跳**(`1 8 1`)、一五一→**五度跳**(`1 5 1`)、延伸琶音音階去除「(三連音)」註記。id 不變(`unison-x3`/`fifth-lhl`)避免舊 localStorage patternId 失效。

## 已知陷阱(SPEC Section 7,實作時務必記得)

1. `-` 不可作 pattern 分隔符(與負數級數衝突),用空白。
2. JS `-1 % 7 === -1`,degreeToSemitone 用 `((x%7)+7)%7`。
3. iOS 靜音開關 → 需無聲 audio unlock。
4. GitHub Pages 子路徑 → `base: './'`,資產相對路徑。
5. Service Worker 必須 cache 音檔,否則離線無聲(最尷尬失敗)。
6. setTimeout 手機必 drift → 用 Tone.Transport。
7. topRoot 是根音不是最高音 → 即時音域回饋(SPEC 2.6)不可省。
8. Wake Lock 在 visibilitychange 後失效 → 需重新 request。
