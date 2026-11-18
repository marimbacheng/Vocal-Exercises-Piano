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
- **取樣載入不可用 `Tone.loaded()`**(修「Android 開始鍵永久變暗」):`Tone.loaded()` 等的是**全域** `ToneAudioBuffer.downloads` 陣列,
  而把項目移出陣列的程式寫在該下載自己的 `finally` 裡——請求 stall 就永遠不會被移除,**全域陣列被永久污染**,
  之後每次 `Tone.loaded()` 都被那筆舊的擋死,連建新 Sampler 也救不回來。行動網路(Android 弱訊號)常見「連著但沒吞吐」,
  fetch 不報錯也不完成 → UI 永遠停在「載入中…」、`playBtn.disabled` 永久為 true。
  改用 **Sampler 實例自己的 `onload`/`onerror`**,把等待收斂到單一實例;外加 **20s 逾時**讓 stall 變成可見錯誤。
  另修:`sampler` 改為**只在成功後才指派**(舊版在 await 前就指派,載入失敗後下次呼叫會拿到半成品 → transport 照跑但完全無聲);
  並行呼叫共用 in-flight promise。
  **逾時不自動重試**——Tone 用裸 `fetch`、無 `AbortController`,卡住的請求無法中止,立刻重試只是再空等一輪;
  改為回報可行動訊息由使用者手動再按。非逾時的失敗(404 / 解碼錯誤)才自動重試一次。
  落選:①只在 `Tone.loaded()` 外包 timeout——全域污染仍在,重試照樣卡死(淺層修復);②逾時後自動重試——見上。
- **載入中可按「停止」中止**:UI 加 `startGen` 序號,按停止即遞增作廢該次啟動(否則載完會自己開始播、且 `loading` 不會收掉)。
  給弱網使用者立即的逃生出口,不必乾等 20s。`loading` 另在 `finally` 兜底歸零。
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
  **現行 range 50–130**(=四分 100–260)、default 80。storage key `v2`。下限兩度放寬(80 → 60 → 50),讓慢速暖嗓/困難音型可用;上限與 default 不變。
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

### 降記號 = DSL 的後綴 `b`
為了寫「七和弦」需要 ♭3 / ♭7,而**大調任意複合級數能產生的半音類只有 `[0,2,4,5,7,9,11]`**,
♭3(3 半音)與 ♭7(10 半音)**數學上湊不出來**——沒有繞道空間,只能擴充 DSL。
- 語法 `degree` + 後綴 `b`(如 `7b`、`3b:2`、`-1b`),解析為 `alter: -1`。
  **自然音不寫入 `alter` 欄位**,既有 `toEqual` 斷言與 round-trip 皆不受影響。
- `Note.alter` 用**數字**而非布林,日後加升記號(`+1`)不必改型別。
- `degreeToSemitone/Midi`、`degreeToSolfege/Jianpu` 一律加**選用參數** `alter = 0`,
  舊呼叫端不必改;需要的 4 個呼叫點(range/plan/輪廓/now-note)顯式傳 `n.alter ?? 0`。
- 顯示:唱名用降音慣例(♭3 = **Me**、♭7 = **Te**、♭2 Ra、♭5 Se、♭6 Le);簡譜 **♭ 放數字前**(`♭3`),
  八度組合點仍附在數字上不會跑到 ♭ 身上。
- `0b` / `7bb` / `b7`(前綴)一律拒絕,有測試涵蓋。
- 落選:①改用小調音階——`sanitizeParams` 強制大調,且單一音階給不出「同時有自然 3 與 ♭3」;
  ②砍掉降記號只留自然音——屬七與小七就不成立,等於不是該練習。
- ⚠️ 絕對音名(`midiToName`)仍以**升記號**呈現(B♭ 顯示為 A#),僅影響音域標籤;
  主顯示走唱名/簡譜,已正確顯示 ♭。目前不改。

### 休止符 = DSL 的 `0`(`5ba23aa`)
採**簡譜慣例**(簡譜的 `0` 即休止),`parsePatternDsl` 把 degree 0 解析為 `{degree:0, beats, rest:true}`。
- `buildSessionTimeline` 遇 rest **不排音符事件、只推進拍數**(`indexInRun` 仍用 noteIdx,才能對齊輪廓高亮)。
- `computeSungRange` 濾掉 rest;`renderContour` 不畫 rest 的點(留空隙,data-i 保留供高亮對齊)。
- **取捨**:`degreeToSemitone(0)`(低 Ti,root−1)仍是有效數學(degree.test 直接測),但 **DSL 層不再產出 degree-0 發聲音符**,
  亦即低 Ti 無法再寫進音型。可接受:大調暖嗓不用它,且無音型使用。
  落選:另用 `r`/`_` 專屬 token——本 app 以簡譜為介面,`0` 最直覺(使用者自己就是這樣寫的)。

### 音型命名與清單(`5ba23aa`,共 23 個)
依家族分組:**五度順階**×3、**五度琶音**×2、五度跳、八度跳、**梯形音階**×5、**梯形下行**×4、**長音階**×3、**折返音階**×2、**音程擴展**×1、**七和弦**×1。
- **大調音程擴展**(`ivl-expand`):主音踏板 + 目標音逐步擴大(1-2…1-1̇),中段 `1 0` 踩回主音換氣,
  後半改以高八度為踏板逐步縮小(1̇-7…1̇-1)。30 顆、每顆 1 四分拍,屬**一般音型**(非三連音)——
  結構是 15 組「踏板音 + 目標音」的偶數配對;且 30 顆若走三連音會算出 32 個位置、除不盡 3 而離格。
- **七和弦**(`seventh`):四段琶音、段間 `0` 換氣——三和弦 → 大七(`7`)→ 屬七(`7b`)→ 小七(`3b` `7b`),
  在同一主音上比較和弦色彩。37 顆、每顆 1 四分拍,**一般音型**(沿用「大調音程擴展」的節奏取向)。
  是第一個用到降記號的音型。
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

## 音準模式(規劃中;iOS spike 驗證中)

**有意識推翻 SPEC Section 0 的非目標「不做錄音、不做音準偵測 / pitch detection」**(使用者於 2026-11 拍板)。
原本劃這條線是為了專案初期防 scope creep;核心練唱功能已穩定,時機成熟。
- **理由**:這是練唱 app 最自然的下一步。且本 app **已知每一刻的目標音**(`onNote(midi, indexInRun)`),
  可直接顯示「目標 A4,你高了 23 cents」——這是一般調音 app 做不到、值得做在這裡的原因。
- **架構**:音高偵測為純函式(預計 `analysis/pitch.ts`,吃 `Float32Array` 回頻率,可用合成正弦波在 Vitest 測);
  麥克風封裝在 `platform/mic.ts`,與 `ios-audio.ts`、`wake-lock.ts` 並列;即時繪製走 `requestAnimationFrame`,不違反禁用 setTimeout。
  音準模式**只即時分析、不儲存任何錄音**。
- **獨立模式(確定採用)**:「練唱模式 / 音準模式」二選一,**麥克風只在使用者切到音準模式時才啟動**。
  把 iOS session 風險與權限詢問關在一個開關後面,不影響現有練唱流程。
- **必要條件(確定)**:**戴耳機**,或**電腦播放音階、手機靠近自己當收音麥克風**(雙機)。
  麥克風會收到鋼琴聲,瀏覽器 `echoCancellation` 是為講話設計,對持續樂音不可靠——UI 須明確告知此條件。
- **待驗證(最大風險)**:iOS 一旦 `getUserMedia`,audio session 由 `playback` 切成 `playAndRecord`,
  可能把輸出改路由到**聽筒**(音量大降),並與 `unlockAudioSession` 的靜音開關 workaround 交互作用。
  以 `spike-mic.html`(丟棄式測試頁,沿用正式的 `unlockAudioSession` + `loadSampler`)在真機驗證後再決定實作形態。
- 落選:①麥克風常駐開啟——iOS 風險與權限詢問會擴散到所有使用者;②依賴 `echoCancellation` 讓單機外放可用——對樂音不可靠。
- **spike 第一輪結果(2026-11-18,Mac Chrome 153,內建麥克風)**:
  - ✅ 真人聲長音讀數穩定且準(演算法先以 38 組合成訊號驗證,誤差 < 0.6 cents、無八度誤判)。
  - ✅ 效能:每次偵測平均 0.69 ms、最大 7.5 ms(60fps 預算 16.7 ms)。iPhone 待測。
  - ✅ 喇叭外放時麥克風**確實收到鋼琴聲**→ 證實「戴耳機或雙機」為必要條件;**戴有線耳機即解決**。
  - ✅ Chrome 會照收音設定給原始訊號(`getSettings()` 中 EC/NS/AGC/voiceIsolation 皆 false)。
  - ⚠️ 藍牙耳機音質沒變差,但原因是 **Chrome 沿用網站設定裡記住的內建麥克風**,沒有用到耳機的麥克風(紀錄可證)。
    正確結論是「輸入用內建麥克風、輸出用藍牙」不會掉成通話音質——這正是音準模式的理想組合;
    **耳機麥克風被選用時是否掉成通話音質,仍須在 iPhone 驗證**(iOS 連 AirPods 時通常直接用耳機麥克風)。
  - ⚠️ 「收到鋼琴聲」比例會把**跟著鋼琴唱同音**也算進去;第一輪的 43% 混了多種情境,不採用。
    spike 已改為每段(重算/關麥)各自寫入紀錄,步驟改為「重算後完全不出聲約 10 秒」。
  - ❓ 未回答(Mac 無此情境):**iOS 開麥後是否改路由到聽筒、靜音開關是否失效**——最大風險仍待 iPhone 驗證。
- **spike 第二輪結果(2026-11-18,iPhone iOS 18.7 Safari,48 kHz)**:
  - ❌ **最大風險證實**:開麥後鋼琴**離開喇叭、音量明顯變小**。靜音開關 workaround 未被破壞(開麥後靜音模式仍有聲)。
    注意 iOS 回報的預設輸出仍是「擴音」——**裝置標籤無法分辨喇叭/聽筒**,不可用來偵測路由。
  - ❌ **關麥後不會恢復**(tracks 全停,音量仍小)——比預期多一層:離開音準模式後練唱模式也會變小聲。**正式實作前必須解決。**
  - ❌ **單機外放完全不可用**:50 秒僅 42 次有效偵測、唱長音讀數不穩。鋼琴即使被壓小仍會混進麥克風,
    兩個音高讓單音偵測判定不清晰而放棄。→「戴耳機」由建議**升級為硬性條件**。
  - ✅ **有線耳機完全正常**(iPhone 麥克風收音、輸出至 USB-C 轉接器,讀數只跟人聲)——目前唯一驗證可行的組合。
  - ✅ 拔耳機 → AudioContext 自動 `suspended`;主 app 既有的「中斷→自動暫停並提示」會接住,行為正確。
  - ⚠️ 藍牙耳機:iOS **直接改用耳機麥克風,取樣率 16 kHz**(通話模式特徵),與 Mac Chrome 行為不同。
    使用者感覺音質未變差;藍牙下的偵測準確度**尚無數據**。
  - ✅ 裝置標籤**能正確辨識耳機**(「USB-C對3.5公釐耳機插孔轉接器」「WF-1000XM6」)→ 可用來在未戴耳機時擋下/警告。
  - 效能:平均 0.16 ms、最大 12 ms → 維持約 30 fps 偵測。
  - **設計影響**:既然必須戴耳機,開麥時的路由問題不影響音準模式本身;剩下要解的是**離開後的恢復**、藍牙準確度、未戴耳機的防呆。
    「雙機模式」需重新評估:手機不播聲音就沒有路由問題,但兩機間無同步,手機不知目標音,只能當一般調音器,失去「差幾 cents」的核心優勢。
  - 下一輪 spike:測四種恢復法(Audio Session API / 重播無聲音軌 / 重建 AudioContext / 重新整理)與藍牙偵測準確度。

## 對外呈現(連結預覽 / iOS)

- **iOS 加主畫面預設名稱**(`60bffd0`):由 `index.html` 的 `apple-mobile-web-app-title` 決定(不是 `<title>`)。
  由 `Vocal Piano` 改為 `Vocal Exercises Piano`;manifest `short_name` 一併改為全名。
  注意:iOS 主畫面**標籤會截斷**,但「加入主畫面」對話框帶入的預設名稱是完整字串。
- **連結預覽固定英文名**(`a710e85`, `e4524ca`):原本**無 OG 標籤**,抓取器退而讀 manifest 的中文說明,把「聲樂音階練習」當成名稱。
  加上 `og:title`/`og:site_name`/`twitter:title` = `Vocal Exercises Piano`,並把 meta/og/manifest 的 description **全改英文**,
  讓部署頁面完全不含該中文字串。
  **重點**:連結預覽卡片由各平台(LINE/iMessage/FB)**重度快取**,改完不會立即反映;
  驗證要用加查詢字串的新網址(如 `?v=2`)或平台的 re-scrape 工具。這不是程式問題,別再改 code。
- **加入主畫面說明補上 LINE 路徑**:使用者多半從 LINE 點連結進來,而 **LINE 內建瀏覽器無法加入主畫面**,
  必須先「右下角三個點 → 在瀏覽器中開啟」。另 iOS 分享選單的「加入主畫面」常被收在「檢視更多」裡,
  故把完整路徑(分享 → 檢視更多 → 加入主畫面 → 加入)一併寫明,避免使用者在分享選單第一頁找不到而放棄。
- **「速度」英文副標 TEMPO → BPM**:使用者要求,UI 顯示更直接。
  ⚠️ 注意這個值仍是**二分音符 BPM**(player 內 `quarterBpm = bpm × 2`),副標寫 BPM 不代表它是四分音符 BPM。
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
15. **禁用 `Tone.loaded()`**——它等全域 `downloads` 陣列,一筆 stall 就永久污染,之後所有載入都卡死。
    用 Sampler 實例的 `onload`/`onerror` + 逾時。Tone 內部是裸 `fetch`、**無法中止**已送出的請求。
16. **任何會讓 `loading` 卡住的路徑 = 開始鍵永久變暗**(`playBtn.disabled = loading || …`)。
    新增 await 步驟時務必確保有逾時與 `finally` 歸零。「開始鍵是暗的」另一個合法原因是音域超標(SPEC 2.5),
    差別:那時按鈕文字仍是「▶ 開始」且旁邊有音域警告;載入卡住則顯示「載入中…」。
17. **大調級數湊不出 ♭3 / ♭7**——可得半音類只有 `[0,2,4,5,7,9,11]`。要寫變化音**只能用後綴 `b`**,
    不要試圖用複合級數或換音階繞過。`alter` 必須一路傳到 `degreeToSemitone/Midi`,漏傳會靜默唱成自然音。
18. **SW 會把未 precache 的 html 導航一律回成 `index.html`**(workbox `NavigationRoute` fallback)。
    新增任何獨立 html 頁(如 spike)**必須留在 precache 裡**——`globPatterns` 已含 html,勿用 `globIgnores` 排除;
    已裝 app 的裝置第一次開新頁仍是舊 SW 控管,可能先看到主 app,重新整理一次即正確。
19. **狀態追蹤別用 `Tone.Draw`**——它靠 rAF 執行,且會**丟掉延遲 > 250ms 的回呼**。rAF 被降頻時(背景窗格實測 2 fps、
    iPhone 低電量模式 30 fps)會漏更新。音準模式要比對「當下目標音」時,必須在排程回呼裡直接更新
    (主 app 的 `onNote` 即是如此)。spike 曾因此誤判「重建 AudioContext 後鋼琴沒在播」,實為畫面沒更新。
