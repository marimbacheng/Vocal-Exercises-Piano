# Vocal Exercises Piano（vocal-warmup-piano）

純前端 PWA:取樣鋼琴音色播放聲樂練習音型,自動半音移調,可離線使用。詳見 [docs/SPEC.md](docs/SPEC.md)。

## 開發

```bash
npm install
npm run dev      # 開發伺服器
npm run test     # 單元測試
npm run build    # tsc 檢查 + 產生 dist/
```

## 部署到 GitHub Pages

`base: './'` 使用相對路徑,任何 repo 名皆可運作。

1. 建立 GitHub repo(建議名 `vocal-warmup-piano`),push 本專案到 `main`。
2. repo → **Settings → Pages → Build and deployment → Source** 選 **GitHub Actions**。
3. push 到 `main` 會觸發 [.github/workflows/deploy.yml](.github/workflows/deploy.yml) 自動 build + 部署。
4. 完成後網址為 `https://<user>.github.io/<repo-name>/`。

### 離線 / 安裝
- Service Worker 已 precache 全部 17 個鋼琴取樣 mp3,飛航模式下仍可完整播放。
- iOS:Safari 開啟網址 → 分享 → 加入主畫面。

## 授權
鋼琴音源 Salamander Grand Piano(作者 Alexander Holm),[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。
