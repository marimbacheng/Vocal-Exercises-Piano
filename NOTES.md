# NOTES — 決策記錄

- 2026-07-14 骨架採 vanilla TS,不用 React:SPEC 附錄 A 允許二擇一,app 規模小、無複雜狀態樹,少一層依賴。落選:React(若 M3 UI 複雜度超出預期可再議)。
- 2026-07-14 SPEC 正本放 docs/SPEC.md(自根目錄的《綜合音階練習.md》複製而來,原檔保留未動;規格如有修訂以 docs/SPEC.md 為準)。
- 2026-07-14 test script 用 `vitest run`(單次執行)而非 watch 模式:配合驗收流程,要看一次性通過/失敗結果。
- 2026-07-14 vite-plugin-pwa 先以最小 manifest 設定放入 config(base './'、standalone、start_url './'),SW precache 音檔等 M4 才處理。
- 2026-07-14 開發機原本沒有 Node,以 Homebrew 安裝 node 26.5.0(/usr/local)。

## M1
- 2026-07-14 取樣集:Salamander Grand Piano(CC BY 3.0,tonejs.github.io/audio/salamander),C2–C6 每小三度 17 檔共 1.2 MB,放 public/samples/。UI 的授權標註屬 M3,尚未做。
- 2026-07-14 Transport 排程用 ticks(`${n}i`,beats × PPQ),音長用秒;排程回呼內呼叫 transport.stop 必須帶入回呼的 time 參數,否則 Tone 警告且有精度誤差(已修)。
- 2026-07-14 iOS 靜音開關的無聲 <audio playsinline> unlock(SPEC 3.4.2)刻意不在 M1 做:M1 gate 是桌機 Chrome,留到 M4/M5。
- 2026-07-14 vite-plugin-pwa 目前 precache 只有 4 entries,不含 samples——M4 必須補 globPatterns 含 mp3(陷阱 #5),否則離線無聲。
- 2026-07-14 main.ts 目前是 M1 驗證用臨時 UI(單一 Play 按鈕),M3 會整個換掉。
- 2026-07-14 移除骨架期的 smoke.test.ts(已有真測試,無存在必要)。

## M2
- 2026-07-14 timeline 設計:buildSessionTimeline 把整個 session 展開成純資料事件列表(拍為單位),音訊層一次性全排上 Transport。單一排程來源 = gap 一致、無累積 drift;事件帶 runIndex 供 M3 pause/resume 與 UI 顯示。
- 2026-07-14 gap 佈局統一為「前半 current triad、後半 next triad」(各 gapBeats/2),涵蓋 SPEC 2.3 的 1/2/>2 三種描述。
- 2026-07-14 修 bug:session 結尾 transport.stop 歸零 position 後,tick 0 的 count-in 事件會在同一 lookahead 內重放(狀態 finished 又跳回 countIn)。修法:finished 回呼內先 transport.cancel(0) 再 stop(time)。
- 2026-07-14 pause/resume(SPEC 2.4,從當前 run 開頭重來)依核可的計畫延至 M3。
- 2026-07-14 count-in 期間 run 顯示殘留上一次的文字 —— 臨時 UI 的已知小瑕疵,M3 正式 UI 處理。
- 2026-07-14 驗證方法:頁面掛 MutationObserver 記錄狀態轉換 + transport.seconds,取代人工輪詢(瀏覽器工具往返延遲 >10s,輪詢不可靠)。

## M3
- 2026-07-14 pause/resume 實作:SessionPlayer 抽出 scheduleAndStart(fromRunIndex),start 與 resume 共用。pause = transport.pause()+cancel+releaseAll;resume 從 currentRunIndex 重排,略過 count-in 與該 run 前的 gap,時間軸以該 run 首音 rebase。currentRunIndex 在 run 首音回呼更新,gap 期間維持在剛唱過的 run(暫停於 gap → resume 重唱該 run)。
- 2026-07-14 SAMPLER_MIN/MAX_MIDI 移到無依賴的 audio/sampler-range.ts,讓 session/range.ts 純邏輯不必 import Tone(node 測試環境無 Web Audio)。player.ts re-export 保持相容。
- 2026-07-14 參數持久化:state/params.ts,localStorage key vocal-warmup-params-v1;sanitizeParams 逐欄 clamp+fallback,壞 JSON/隱私模式寫入失敗皆不 crash。
- 2026-07-14 UI 為 vanilla TS(ui/app.ts)+ style.css,深色、底部固定 56px 控制列、−/+ 長按連續步進(pointerdown 400ms 後每 80ms)。
- 2026-07-14 startRoot 升過 topRoot 時連動推高 topRoot;topRoot 不可低於 startRoot(SPEC 2.5),已實測。
- 2026-07-14 forceMajorCue 已放入 UI(checkbox),預設 false;附錄 B 待確認項僅影響小調,不阻擋。
- 2026-07-14 CC BY 3.0 標註已入頁尾(SPEC 3.2);iOS「加入主畫面」說明用 <details> 可收合。
- 2026-07-14 vite/client 型別:新增 src/vite-env.d.ts,否則 import './style.css' tsc 報 TS2882。

## M4
- 2026-07-14 圖示:用零依賴 Node 純手寫 PNG 編碼器(scratchpad/gen-icons.mjs)生成 icon-192/512 + apple-touch-icon(180),放 public/。漸層藍底+鋼琴鍵+八分音符。原本想用瀏覽器 canvas base64,但 220KB 超過工具回傳上限,改 Node 直接寫檔。
- 2026-07-14 陷阱 #5 已解:workbox globPatterns 加 mp3,precache 從 5→29 entries;runtime 驗證 SW 快取含全部 17 mp3。maximumFileSizeToCacheInBytes 放寬到 5MB。
- 2026-07-14 離線驗證方法:build → 靜態 server 掛在 /vocal-warmup-piano/ 子路徑(模擬 GitHub Pages)→ 載入等 SW 快取 → 殺掉 server(真斷網)→ 重載仍開得起來、短 session 播放聽到 27 音、17 mp3 全從 cache 載入、state=finished。這是陷阱 #5 的直接反證。
- 2026-07-14 apple-touch-icon 用相對路徑 ./apple-touch-icon.png(iOS 不讀 manifest 圖示);manifest scope/start_url 皆 './'。
- 2026-07-14 部署:加 .github/workflows/deploy.yml(GitHub Actions build+deploy Pages),需 npm ci → package-lock.json 已在。實際 push/建 repo/開 Pages/實機飛航測試屬使用者動作(對外發布 + 需 iPhone),不由我代做。
- 2026-07-14 M4 gate「部署 GitHub Pages 無 404」與「實機飛航」尚待使用者部署後驗;本機已證離線可用、子路徑資產無 404、SW 快取完整。

## M5
- 2026-07-14 iOS 靜音 unlock(SPEC 3.4.2):platform/ios-audio.ts,首次手勢建構極短無聲 WAV(程式生成 blob,不嵌大 base64),隱藏 append 到 DOM 後 play。必須在 handler 內任何 await 之前呼叫(手勢同步鏈)。已驗:audio 元素有 playsinline + webkit-playsinline、blob 源、volume 0。
- 2026-07-14 Wake Lock(SPEC 3.4.3 / 陷阱 #8):platform/wake-lock.ts。visibilitychange 回前景重新 request。修 bug:多個 active 狀態變化併發 acquire 時,release 執行時 sentinel 仍 null、之後 in-flight 才 resolve 存入 → 螢幕鎖洩漏、停止後不釋放。修法:加 acquiring 護欄 + await 後若 want 已 false 立即釋放。已驗:停止後 want=false 中止再請求循環。
- 2026-07-14 註:自動化瀏覽器分頁非 visible,取得 screen wake lock 會被 OS 立即釋放(觸發 release 事件),造成 request 計數持續增長,是測試環境假象非 bug。實機 visible 分頁不會。
- 2026-07-14 中斷偵測(SPEC 3.5):audio/player.ts onAudioContextStateChange 監聽 rawContext statechange;app.ts 在 state≠running 且播放中 → player.pause() + interrupted 提示「已中斷(來電/切換 app)」。resume 前先 ensureAudioRunning() 讓 context 從 suspended 恢復。已驗完整循環:suspend→paused+提示→繼續→running→續播→finished。
- 2026-07-14 清掉 audio/player.ts 的 M1 遺留死碼 playRun(已被 SessionPlayer 取代)。
- 2026-07-14 M5 gate 四項的實機部分(加入主畫面啟動、實體靜音開關有聲、Wake Lock 螢幕不熄、來電後 paused)需使用者 iPhone 實測;桌機已驗全部程式路徑接線正確。

## 部署
- 2026-07-14 部署至 GitHub:repo marimbacheng/Vocal-Exercises-Piano(public),網址 https://marimbacheng.github.io/Vocal-Exercises-Piano/。
- 2026-07-14 首次 push 遇 HTTP 400(curl 56):初始推送量(含 17 mp3)超過預設緩衝。修:git config http.postBuffer 524288000 + http.version HTTP/1.1,重試成功。
- 2026-07-14 Pages 以 GitHub Actions 部署(gh api build_type=workflow);deploy.yml build 18s + deploy 10s 成功。線上驗證:資產全 200、無 404、頁面完整渲染、G5/C4 音域回饋正確。
- 2026-07-14 .claude/settings.local.json 加入 .gitignore(本機權限設定,不進 public repo)。
- 2026-07-14 M4 gate「部署 GitHub Pages 無 404」已達成(線上實測)。剩 M5 實機(iPhone 加入主畫面 + 撥電話驗靜音/Wake Lock/來電 paused)為使用者動作。
