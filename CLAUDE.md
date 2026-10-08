# CLAUDE.md

給 Claude Code 與開發者的專案說明與**開發進度**。每次工作結束前請更新「開發進度」與「工作紀錄」。
完整設計與計畫在 [`docs/PLAN.md`](docs/PLAN.md)，需要細節時再讀，不必整份載入。

## 專案概況

換匯比較面板：靜態網頁（GitHub Pages），比較 TWD／CNY ⇄ VND 經 USDT、經 USD、直換的實得匯率，標出最划算的方式。

- Repo：`dennyhty/currency-exchange`（public）
- 網址（Pages 啟用後）：https://dennyhty.github.io/currency-exchange/
- 預定技術：Vite + TypeScript + Vitest；GitHub Actions 排程抓資料 → `rates.json` → 隨網站部署到 Pages
- 資料來源：BitoPro、玉山銀行、Binance C2C Express、GolaVisa（路徑公式見 PLAN.md §4，來源現況見 §5）

## 工作規則

- 用**繁體中文**回覆與寫文件；程式碼與識別字用英文。
- 開發分支：`claude/focused-curie-di0jvs`。功能走分支 → PR → CI → 合併，不直接推 `main`。**使用者沒明說就不要開 PR。**
- 小步 commit，訊息格式 `type: summary`（`feat`／`fix`／`docs`／`test`／`chore`）。commit 後 push 到指定分支。
- repo 是 public：**不得**放任何金鑰、token、個人資料。所有來源都是公開行情，前端也不放 token。
- 買賣方向與公式以 PLAN.md §4 為準。改公式時，同步改單元測試與文件。
- 資料來源多為非官方或網頁解析：每個 adapter 獨立；失敗時標「資料過期／不足」，**不得顯示錯誤數字**。
- 任何匯率數字旁都要看得到來源與取得時間；GolaVisa 另標網站自己的更新時間。
- 規則變動、做出新決策時，更新本檔，不要只留在對話裡。

## 已知限制

- Claude 雲端 session 的網路政策擋住四個來源網域（CONNECT 403），WebFetch 也一樣。要測外部來源：推一次性的 probe workflow（push 觸發），讀 GitHub Actions 日誌（`get_job_logs`；日誌大時會存成檔案，用 python 解碼）。Phase 0 就是這樣做的，結果在 `docs/data-sources.md`。
- GolaVisa 有 Vercel 機器人檢查，不繞過。
- Repo 設定（Pages Source、branch protection）Claude 無法操作，需使用者在 GitHub 網頁設定。

## 開發進度

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 資料來源探測（決定架構） | ✅ 完成（GolaVisa 待使用者貼頁面內容） |
| 1 | 骨架、GitHub 管控、空殼上線 | 🚧 程式與 workflow 完成；待使用者啟用 Pages、合併 PR 後上線 |
| 2 | 抓取層（玉山、Binance 費率 + 瀏覽器端 BitoPro／Binance） | ⏳ 未開始 |
| 3 | 計算引擎與畫面（含 GolaVisa 貼上解析） | ⏳ 未開始 |
| 4 | 選配（走勢、通知、PWA…） | ⏳ 未開始 |

狀態圖例：⏳ 未開始｜🚧 進行中｜✅ 完成｜⛔ 受阻

### 已完成

- [x] 2026-10-08　規劃完成並寫入 `docs/PLAN.md`
- [x] 2026-10-08　repo 改為 public
- [x] 2026-10-08　Phase 0 探測完成：`docs/data-sources.md`、`fixtures/`
- [x] 2026-10-08　Phase 1 骨架：Vite + TS + Vitest、ESLint/Prettier、CI、Pages 部署 workflow、Dependabot、PR 範本

### 下一步

1. 使用者：貼 GolaVisa 頁面文字；啟用 Pages（Source＝GitHub Actions）；設 `main` 保護；合併 PR。
2. Phase 2：`src/sources/` 的 adapter（BitoPro、Binance 瀏覽器端；玉山、Binance 費率 Node 端），用 `fixtures/` 寫測試；排程 workflow。
3. Phase 3：計算引擎（PLAN §4）與畫面。

### 待使用者決定

見 PLAN.md §9。

### 阻礙

- GolaVisa 無法自動抓（Vercel 檢查站），等使用者提供頁面樣本。

## 工作紀錄（最新在上）

每次 1–3 行；太長時把舊紀錄移到 `docs/` 下歸檔。

- **2026-10-08**　Phase 0 + 1：探測四個來源（BitoPro、Binance 價格皆 CORS 開放；玉山有 JSON 但無 CORS；GolaVisa 被 Vercel 擋）；建 Vite/TS 骨架與 CI/Pages workflow；移除 probe。
- **2026-10-08**　規劃階段。確認 repo 為 public；四個來源網域在雲端 session 皆被擋（403），改以文件／搜尋整理來源資訊（未驗證）；產出 `docs/PLAN.md` 與本檔。尚無程式碼。

## 常用指令

`npm ci`、`npm run dev`、`npm test`、`npm run check`（lint + typecheck + format + test + build，PR 前跑）。
