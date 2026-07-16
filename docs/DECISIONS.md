# 技術決策 · DECISIONS

紀錄「為什麼這樣選、排除了什麼」——commit message 已有的「做了什麼」不重複。
本專案直接 push 到 `main`、**無 PR**,故引用 commit hash(無 PR 連結可附)。

Repo: https://github.com/marimbacheng/Vocal-Exercises-Piano

> **維護規則**:本檔記錄的是**現況**,不是流水帳。決策被推翻時**改寫該條**、把舊做法降級成「落選」,
> 不要往下追加新條目——否則未來會把過時設計當成現行規格照做。

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

## 早期使用者調整(已穩定,未再變動)

- **移除鋼琴音源頁尾**(`d93a810`):CC BY 3.0 **法律要求標註**,不可全刪。改移入預設收合的「音源授權」`<details>`(README 也有),兼顧清爽與合規。
- **暫停可改參數**(`d93a810`):disable 條件由 `isActive()` 改 `isPlaying()`(不含 paused)。暫停中改任一參數 → `dirtyWhilePaused`,繼續時 stop+start 從第一組帶新參數重跑;未改則維持 resume 從當前 run。
- **只留大調**:先移 forceMajorCue(`d93a810`),再移音階選擇器 UI(`e4aa6ae`),最後 `sanitizeParams` **一律強制回傳 `'major'`**(`8783dc9`)——因為舊 localStorage 存的小調 `scaleId` 會被沿用、導致續播小調。`SCALES` 仍保留三音階資料供 `degree`/`plan` 理論測試,不破壞測試。
- **移除 UI 狀態字**(idle/playing/…,`d93a810`):`now-state` 只顯示 載入中/中斷/錯誤;`errorMsg` 改用獨立變數避免被 refresh 覆蓋。
- **UI 改版:柔和淺藍終端風**(`6a1efc9`):深藍灰底 + 淡藍點綴取代深色綠,中英分區標題。後續(`e4aa6ae`)顯示面板去示波器格線、縮小,改**音高輪廓點陣**(NoteEvent 加 `indexInRun`,onNote 帶序號供高亮)。

## 參數與速度(現況)

- **速度 = 二分音符 BPM**(`d93a810` 起;範圍定案於 `8783dc9`):UI 顯示值 **× 2 = 四分音符 BPM**(`player.ts` 的 `quarterBpm = bpm * 2`)。
  **現行 range 80–130**(=四分 160–260)、default 80。storage key `v2`。
  → **「一整拍」= 使用者感知的二分音符 = 2 個四分拍 = pattern DSL 的 `beats: 2`。** 這是所有和弦長度的換算基準。
  落選:UI 值直接當四分音符 BPM(移除 `× 2` 即可,但會改變既有使用者的速度感)。
- **間隔固定 2 拍**(`8783dc9`):移除 TEMPO 的「間隔」stepper UI 與事件,`sanitizeParams` 強制 `gapBeats = FIXED_GAP_BEATS(2)`。
  `buildSessionTimeline` **仍接受任意 gapBeats**(純邏輯測試沿用),只是 UI 不再產出其他值。

## 音型系統(現況)

### 三連音系列——半速 + 統一收尾
> 這一段經過 4 輪迭代才定案,以下是**最終規格**;中途版本(全速三連音、末音 `1:2`、單和弦間隔 `beats:1`、
> 兩和弦各 2 拍、`1-0-1` 轉音…)**全部作廢**,勿回頭採用。

- **半速三連音**:每顆三連音 = **2/3 四分拍(`0.66666`)**,三顆一組 = 2 四分拍 = **一整拍**。長音寫 `:2`。
  用截斷值 `0.66666`/`1.33333`(非精確 2/3、4/3)以沿用現有 DSL parser;三顆相加 ≈1.99998,誤差約十萬分之一拍、聽感不可辨。
  落選:parser 加分數語法(`1:2/3`)——需改 round-trip 測試,收益不成比例。
- **統一收尾**:pattern 末音為**主音撐前兩顆**(`1:1.33333`),第三顆(2/3 拍)由 `plan.ts` 補**當前調三和弦**(接過去),
  再接**新調三和弦一整拍(2 拍)**。當前調和弦剛好補滿最後一組三連音、對齊 grid;整體聽感比照「五度琶音 - 基本」的結尾和弦。
  落選:①末音 `1:1.33333 1:0.66666`(長短兩個唱音)——第三顆應是和弦不是唱音;
  ②兩和弦各佔 2 拍(2+2)——與最後一組三連音脫節、離格。
- **`tripletGap` 旗標**(`Pattern` / `SessionParams`;取代早期的 `triplet` / `singleChordGap` 布林):
  - `'both'` = 當前調三和弦(2/3 拍)+ 新調三和弦(2 拍),每個 gap 共 2⅔ 拍。**全部三連音音型都用這個。**
  - `'nextOnly'` = 只放新調和弦 2 拍。仍支援、有測試涵蓋,但目前無內建音型使用。
  - 未設 → 一般音型的標準間隔(當前調 `gapBeats/2` + 新調 `gapBeats/2+1`),不變。
  - `plan.ts` 依旗標分支;`player` 的 gap 狀態由 gapCurrent **或** gapNext 觸發(單和弦時只有 gapNext)。

### 休止符 = DSL 的 `0`(`5ba23aa`)
採**簡譜慣例**(簡譜的 `0` 即休止),`parsePatternDsl` 把 degree 0 解析為 `{degree:0, beats, rest:true}`。
- `buildSessionTimeline` 遇 rest **不排音符事件、只推進拍數**(`indexInRun` 仍用 noteIdx,才能對齊輪廓高亮)。
- `computeSungRange` 濾掉 rest;`renderContour` 不畫 rest 的點(留空隙,data-i 保留供高亮對齊)。
- **取捨**:`degreeToSemitone(0)`(低 Ti,root−1)仍是有效數學(degree.test 直接測),但 **DSL 層不再產出 degree-0 發聲音符**,
  亦即低 Ti 無法再寫進音型。可接受:大調暖嗓不用它,且無音型使用。
  落選:另用 `r`/`_` 專屬 token——本 app 以簡譜為介面,`0` 最直覺(使用者自己就是這樣寫的)。

### 音型命名與清單(`5ba23aa`,共 21 個)
依家族分組:**五度順階**×3、**五度琶音**×2、五度跳、八度跳、**梯形音階**×5、**梯形下行**×4、**長音階**×3、**折返音階**×2。
- 舊名對照:五度上下行→五度順階、琶音→五度琶音(x3 已刪)、八度頂音重複→梯形音階、八度大跳→八度跳、延伸琶音音階→長音階。
- **id 一律不變**(`p5-x1`/`arp-x1`/`oct-rep4`/`unison-x3`/`ext-13`…),避免舊 localStorage 的 `patternId` 失效;
  故 id 與新名稱不完全對應(如 `oct-rep4` = 「梯形音階 - 基本」),屬刻意取捨。
- **PATTERNS 型別**:抽出 `PATTERN_SOURCE`(`Array<Omit<Pattern,'notes'> & {dsl}>`)讓 `tripletGap` 字面值收斂為聯合型別,再 `.map` 補 `notes`。

## 顯示(現況)

- **音名改首調唱名 / 簡譜**(`8783dc9`):`now-note` 由絕對音名(C4)改為當前音在音型中的級數 →「首調唱名 / 簡譜」(如 `Mi / 3`)。
  新增 `degreeToSolfege`/`degreeToJianpu`(note-name.ts,純函式);簡譜高/低八度用組合附加點 U+0307 / U+0323。
  `onNote` 由 midi 改查 `pattern[indexInRun].degree`。
- **音名固定位置**(`e6da3c2`):`now-note` 拆成 `.solfege`(固定寬 3.2ch 置中)+ `.jianpu`,
  解決 Sol(3 字母)vs Do/Mi(2 字母)造成「/ 簡譜」左右位移。
- **音域標籤**(`8783dc9`):起始音→「第一組起始音」、最高根音→「最高組起始音」、本次最高/最低演唱音→「本次最高/最低音」;stepper 音名置中。

## 對外呈現(連結預覽 / iOS)

- **iOS 加主畫面預設名稱**(`60bffd0`):由 `index.html` 的 `apple-mobile-web-app-title` 決定(不是 `<title>`)。
  由 `Vocal Piano` 改為 `Vocal Exercises Piano`;manifest `short_name` 一併改為全名。
  注意:iOS 主畫面**標籤會截斷**,但「加入主畫面」對話框帶入的預設名稱是完整字串。
- **連結預覽固定英文名**(`a710e85`, `e4524ca`):原本**無 OG 標籤**,抓取器退而讀 manifest 的中文說明,把「聲樂音階練習」當成名稱。
  加上 `og:title`/`og:site_name`/`twitter:title` = `Vocal Exercises Piano`,並把 meta/og/manifest 的 description **全改英文**,
  讓部署頁面完全不含該中文字串。
  **重點**:連結預覽卡片由各平台(LINE/iMessage/FB)**重度快取**,改完不會立即反映;
  驗證要用加查詢字串的新網址(如 `?v=2`)或平台的 re-scrape 工具。這不是程式問題,別再改 code。
- **頁尾署名**(`51c92e1`):`Made with 🫶🏻 by 仁聲歌唱音樂學苑鄭淩翔`,置中小字,放在收合的「音源授權」下方;可被固定控制列蓋住(使用者確認可接受)。

## 已知陷阱(SPEC Section 7 + 後續累積,實作時務必記得)

1. `-` 不可作 pattern 分隔符(與負數級數衝突),用空白。
2. JS `-1 % 7 === -1`,degreeToSemitone 用 `((x%7)+7)%7`。
3. iOS 靜音開關 → 需無聲 audio unlock。
4. GitHub Pages 子路徑 → `base: './'`,資產相對路徑。
5. Service Worker 必須 cache 音檔,否則離線無聲(最尷尬失敗)。
6. setTimeout 手機必 drift → 用 Tone.Transport。
7. topRoot 是根音不是最高音 → 即時音域回饋(SPEC 2.6)不可省。
8. Wake Lock 在 visibilitychange 後失效 → 需重新 request。
9. **DSL 的 `0` 是休止符,不是 degree 0**。要在音型加音時別誤用 `0`;rest 不發聲、不計音域、不畫輪廓點。
10. **「一整拍」= 2 個四分拍**(速度是二分音符 BPM)。和弦/長音長度算錯多半是把「拍」當成四分音符。
11. **`patternToDsl` 在 `beats === 1` 時省略 beats**,寫音型 DSL 時若要 round-trip 測試過,整拍音符要寫 `8` 而非 `8:1`。
12. **音型 id 與顯示名稱刻意不對應**(如 `oct-rep4` = 「梯形音階 - 基本」),不要為了「整齊」改 id——會讓使用者存的 patternId 失效。
13. **連結預覽卡片被平台重度快取**,改 OG 後不會立即生效;用 `?v=N` 新網址驗證,別以為 code 沒改對。
14. **`sanitizeParams` 會強制覆寫** `scaleId`(→major)與 `gapBeats`(→2);想新增可調參數時記得這裡是最後守門。
