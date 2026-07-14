# 部署 · DEPLOYMENT

## 環境

- **Repo**:https://github.com/marimbacheng/Vocal-Exercises-Piano(public)
- **上線網址**:https://marimbacheng.github.io/Vocal-Exercises-Piano/
- **Node**:本機以 Homebrew 裝 node 26.5.0(`/usr/local`);CI 用 node 20。
- 無任何密鑰 / .env / token。純靜態站,不需環境變數。

## CI/CD

- **Workflow**:[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- **觸發**:push 到 `main`(或手動 `workflow_dispatch`)。
- **流程**:`npm ci` → `npm run build`(tsc + vite build)→ `upload-pages-artifact`(dist)→ `deploy-pages`。
- **Pages 設定**:Source = GitHub Actions(以 `gh api ... pages -f build_type=workflow` 啟用過一次,之後不必再設)。
- 每次 build 約 15–20s、deploy 約 8–11s。

## 本機發佈流程(慣例)

1. `npm run test`(需全綠)+ `npm run build`(需乾淨)。
2. 瀏覽器實測改動(dev server 或 dist)。
3. `git add -A && git commit`(訊息尾附 Co-Authored-By)→ `git push origin main`。
4. `gh run watch <id> --exit-status` 確認 workflow 成功。
5. 線上驗證(見下「上線後驗證」)。

## 首次 push 的坑(已解,若重建 repo 會再遇到)

初始推送含 17 個 mp3,`git push` 撞 **HTTP 400 / curl 56**(超過預設 HTTP 緩衝)。
修法(已寫入本機 repo config):
```
git config http.postBuffer 524288000
git config http.version HTTP/1.1
```

## 上線後驗證

GitHub Pages 用 Service Worker,舊版可能被快取。要驗證新版:
```js
// 在瀏覽器 console 對線上網址執行,再重新整理
navigator.serviceWorker.getRegistration().then(r => r && r.unregister());
caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
```
檢查:資產全 200 無 404、`base: './'` 相對路徑正確、SW precache 含全部 17 個 mp3。

## Rollback

無專用 rollback。回到前一版:
```
git revert <bad-commit>   # 或 git reset --hard <good-commit> 後 force push(單人專案可接受)
git push origin main
```
push 後 workflow 自動重新 build + deploy 舊版。使用者端因 SW `autoUpdate`,重新整理即取得。

## 上線注意事項

- 換更大取樣或加檔案時,確認 `workbox.maximumFileSizeToCacheInBytes`(目前 5MB)與 `globPatterns` 仍涵蓋(陷阱 #5:漏 cache = 離線無聲)。
- 改 `manifest` 圖示 / 名稱後,iOS 已加主畫面的使用者需移除重加才會更新圖示。
- 實機驗證(只能在 iPhone 做):加主畫面啟動、實體靜音開關發聲、Wake Lock、來電後進 paused、飛航離線播放。
