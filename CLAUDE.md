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
| 0 | 資料來源探測（決定架構） | ✅ 完成（GolaVisa：決定手動輸入） |
| 1 | 骨架、GitHub 管控、空殼上線 | ✅ 完成（Pages 已部署、`main` 保護已驗證，PR #1 已合併） |
| 2 | 抓取層（玉山、Binance 費率 + 瀏覽器端 BitoPro／Binance） | ✅ 完成並上線（runner 實測四個來源皆成功；排程每天台北 09:00） |
| 3 | 計算引擎與畫面（含 GolaVisa 手動輸入） | ✅ 完成並上線（PR #4；使用者在手機確認網站正常） |
| 4 | 選配（走勢、通知、PWA…） | ⏳ 未開始 |

狀態圖例：⏳ 未開始｜🚧 進行中｜✅ 完成｜⛔ 受阻

### 已完成

- [x] 2026-10-08　規劃完成並寫入 `docs/PLAN.md`
- [x] 2026-10-08　repo 改為 public
- [x] 2026-10-08　Phase 0 探測完成：`docs/data-sources.md`、`fixtures/`
- [x] 2026-10-08　Phase 1 骨架：Vite + TS + Vitest、ESLint/Prettier、CI、Pages 部署 workflow、Dependabot、PR 範本

- [x] 2026-10-08　Phase 2/3 程式：`src/sources/`（4 個 adapter）、`src/calc/routes.ts`（6 條路徑＋直換）、`src/lib/`（快照合併、新鮮度、儲存）、`scripts/fetch-snapshot.ts`、畫面（方向／金額／路徑卡片／資料狀態／GolaVisa 手動輸入／設定）；54 個單元測試

### 下一步

1. 確認明天台北 09:00 的排程有跑、`rates.json` 有更新（schedule 不保證準時）。
2. 玉山非營業時間／週末的 `UpdateTime` 行為待觀察。
3. 視需要做 Phase 4（走勢、通知、PWA）；Dependabot PR #2（checkout 6→7）可合併、#3（`@types/node` 22→26）建議關閉。

### 待使用者決定

見 PLAN.md §9。

### 阻礙

- GolaVisa 無法自動抓（頁面與 `/api/exchange-rates` 都被 Vercel 檢查站擋）。決定：面板提供手動輸入（四個匯率＋網站更新時間）。

## 工作紀錄（最新在上）

每次 1–3 行；太長時把舊紀錄移到 `docs/` 下歸檔。

- **2026-10-08**　PR #4 合併、網站上線，使用者確認可用；Phase 2、3 完成。
- **2026-10-08**　使用者決定排程一天一次（台北 09:00，cron `0 1 * * *`）；玉山數字最多約 24 小時舊，新鮮度門檻調成 6 小時警示／36 小時過期。
- **2026-10-08**　Phase 2/3 一次做完：adapter＋公式引擎＋畫面＋排程快照。預設值：BitoPro 掛單簿（設定可切一鍵買賣）、只計 Binance VND 0.1%（BitoPro 手續費可自填）。數字用手算案例鎖住買賣方向。
- **2026-10-08**　GolaVisa 手動輸入存在瀏覽器（localStorage），並附貼上 JSON 輔助。
- **2026-10-08**　使用者決定 GolaVisa（TWD／USD ⇄ VND）改為手動輸入，不做排程抓取；已更新 PLAN、data-sources、本檔。
- **2026-10-08**　Phase 1 上線（Pages 部署成功、直接推 `main` 會被擋）。GolaVisa 的 JSON API 由使用者查到，從 runner 仍被 Vercel 擋，改採貼上 JSON；欄位對應寫入 `docs/data-sources.md` §4。
- **2026-10-08**　Phase 0 + 1：探測四個來源（BitoPro、Binance 價格皆 CORS 開放；玉山有 JSON 但無 CORS；GolaVisa 被 Vercel 擋）；建 Vite/TS 骨架與 CI/Pages workflow；移除 probe。
- **2026-10-08**　規劃階段。確認 repo 為 public；四個來源網域在雲端 session 皆被擋（403），改以文件／搜尋整理來源資訊（未驗證）；產出 `docs/PLAN.md` 與本檔。尚無程式碼。

## 常用指令

`npm ci`、`npm run dev`、`npm test`、`npm run check`（lint + typecheck + format + test + build，PR 前跑）。
