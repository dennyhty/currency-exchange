# 換匯比較面板 開發計畫

> 狀態：規劃完成，尚未開工　｜　最後更新：2026-10-08
> 本檔是**設計與計畫**（較少變動）。**開發進度**記錄在 [`CLAUDE.md`](../CLAUDE.md)。

## 1. 目標

做一個放在 GitHub Pages 的換匯面板網頁，手機、電腦打開就能用，讓使用者一眼看出「哪種方式換匯最划算」。

要顯示的六個換匯路徑（公式見 §4）：

- TWD 經 USDT 換 VND、VND 經 USDT 換 TWD
- TWD 經 USD 換 VND、VND 經 USD 換 TWD
- CNY（RMB）經 USDT 換 VND、VND 經 USDT 換 CNY

另外加一條「GolaVisa 直接換 TWD ⇄ VND」當對照組。程式碼全部用 GitHub 管控。

### 指定的資料來源

| 用途 | 來源 | 取用的值 |
|---|---|---|
| TWD ⇄ USD | [玉山銀行 外匯匯率](https://www.esunbank.com/zh-tw/personal/deposit/rate/forex/foreign-exchange-rates) | **即期匯率**的銀行買入／銀行賣出 |
| TWD ⇄ USDT | BitoPro | 最新價格（預設用掛單簿 ask／bid；是否改用「一鍵買賣」報價待確認） |
| USDT ⇄ VND | Binance C2C Express（[賣](https://c2c.binance.com/en/express/sell/USDT/VND)／[買](https://c2c.binance.com/en/express/buy/USDT/VND)） | Estimated price，**另計 Fee rate 0.1%** |
| CNY ⇄ USDT | Binance C2C Express（[買](https://c2c.binance.com/en/express/buy/USDT/CNY)／[賣](https://c2c.binance.com/en/express/sell/USDT/CNY)） | Estimated price |
| TWD ⇄ VND、USD ⇄ VND | [GolaVisa 匯率頁](https://www.golavisa.co/exchange-rate) | 匯率；**網站不是即時更新，必須標註資料更新日期時間** |

## 2. 前提與目前狀態

- ✅ repo 已改為 **public**（2026-10-08 確認）。免費版的 GitHub Pages 與 branch protection 只支援 public repo。
- ⚠️ 四個資料來源網域（`api.bitopro.com`、`www.esunbank.com`、`c2c.binance.com`、`www.golavisa.co`）在 Claude 雲端 session 的網路政策下被擋（CONNECT 403），**尚未實際測試過任何來源**。§5 的來源資訊來自文件與搜尋，全部未驗證，由 Phase 0 驗證。
- 網站是公開的：知道網址的人都看得到。內容只有公開行情，沒有個資、沒有金鑰。

## 3. 架構

```
GitHub Actions（每 5~10 分鐘）
 └ 4 個 adapter：BitoPro / 玉山 / Binance Express / GolaVisa
    └ 格式與合理範圍檢查 → rates.json（每筆含 fetchedAt、sourceUpdatedAt）
       └ 連同網站部署到 GitHub Pages
手機／電腦 → https://dennyhty.github.io/currency-exchange/
 └ 讀 rates.json → 計算引擎 → 路徑比較 + 最划算標示 + 各來源資料年齡
```

- 全程不需要伺服器、不需要金鑰。
- 技術：Vite + TypeScript + Vitest；繁體中文介面、手機優先、深色模式。
- **資料不是即時的**：Actions 排程最短 5 分鐘，實務上常延遲（網路上有說嚴重時到數十分鐘，非官方數字）。畫面顯示「幾分鐘前的快照」並標示資料年齡。
- public repo 60 天沒活動，排程會被自動停用 → 需加 keepalive。
- **升級路徑（不是第一步）**：若 Phase 0 發現 GitHub 的 IP 被 Binance／玉山擋，或需要更即時，就加一個免費的 Cloudflare Worker 當代理與快取。程式仍放本 repo，網頁仍在 GitHub Pages。

### rates.json 草案（Phase 0／2 定稿）

每個來源各有兩個時間：`fetchedAt` 是我們抓取的時間，`sourceUpdatedAt` 是來源自己標示的更新時間（沒有就是 `null`）。

```jsonc
{
  "generatedAt": "<ISO 8601>",
  "sources": {
    "bitopro":        { "status": "ok|stale|error", "fetchedAt": "<ISO>", "sourceUpdatedAt": null,
                        "usdtTwd": { "ask": "<number>", "bid": "<number>", "last": "<number>" } },
    "esun":           { "status": "...", "fetchedAt": "<ISO>", "sourceUpdatedAt": "<ISO，牌價時間>",
                        "usdTwdSpot": { "bankBuy": "<number>", "bankSell": "<number>" } },
    "binanceExpress": { "status": "...", "fetchedAt": "<ISO>", "sourceUpdatedAt": null,
                        "VND": { "buy": "<number>", "sell": "<number>", "feeRate": 0.001 },
                        "CNY": { "buy": "<number>", "sell": "<number>" } },
    "golavisa":       { "status": "...", "fetchedAt": "<ISO>", "sourceUpdatedAt": "<ISO，網站標示的更新時間>",
                        "rates": "<TWD↔VND、USD↔VND，實際欄位待 Phase 0 確認>" }
  }
}
```

## 4. 路徑與公式

每一步都用「你實際會吃到的那一邊」的價格。

符號：

- `B_ask`／`B_bid`：BitoPro USDT/TWD 的賣價／買價（TWD per USDT）。買 USDT 吃 ask，賣 USDT 吃 bid。
- `E_sell`／`E_buy`：玉山 USD/TWD **即期**「銀行賣出」／「銀行買入」（TWD per USD）。買 USD 吃銀行賣出，賣 USD 吃銀行買入。
- `X_buy[幣別]`：Binance Express「買 USDT」的 Estimated price（法幣 per USDT，你付法幣買 USDT）。
- `X_sell[幣別]`：Binance Express「賣 USDT」的 Estimated price（法幣 per USDT，你賣 USDT 收法幣）。
- `G_*`：GolaVisa 的 TWD→VND、VND→TWD、USD→VND、VND→USD（實際欄位待 Phase 0 確認）。
- `fee` = 0.1%：Binance 的 VND 那一腿。

| # | 路徑 | 公式 |
|---|---|---|
| ① | TWD→USDT→VND | TWD ÷ `B_ask` × `X_sell[VND]` × (1−fee) |
| ② | VND→USDT→TWD | VND ÷ `X_buy[VND]` × (1−fee) × `B_bid` |
| ③ | TWD→USD→VND | TWD ÷ `E_sell` × `G_USD→VND` |
| ④ | VND→USD→TWD | VND ÷ `G_VND→USD`（1 USD 要多少 VND）× `E_buy` |
| ⑤ | CNY→USDT→VND | CNY ÷ `X_buy[CNY]` × `X_sell[VND]` × (1−fee) |
| ⑥ | VND→USDT→CNY | VND ÷ `X_buy[VND]` × (1−fee) × `X_sell[CNY]` |
| 對照 | TWD ⇄ VND 直換 | GolaVisa TWD ⇄ VND，用來看繞一圈有沒有比直換划算 |

顯示規則：

- **只在同一方向互相比較**：TWD→VND 比 ①、③、直換；VND→TWD 比 ②、④、直換；CNY ⇄ VND 看 ⑤、⑥。
- 同時顯示「1 TWD = ? VND」與「每 100 萬 VND = ? TWD」；輸入金額後顯示實得金額、與最佳路徑差幾 %，並標出最划算的路徑。
- 每個數字旁標來源與取得時間；GolaVisa 另標網站自己的更新時間。資料超過門檻就變灰並警示。
- 畫面要有「假設與不含項目」說明，結果僅供參考。

Phase 0 要與來源頁面對帳的點：

- Binance 的 0.1% 從哪邊扣（結果等價，但要與頁面的 "You will receive" 一致）。
- 價格是否隨金額變動（若會，試算金額要固定一個基準）。
- CNY 那一腿有沒有手續費。
- 玉山要鎖定「即期」欄位，避開「現金」與「網銀優惠」欄；非營業時間牌價是否仍更新。

## 5. 資料來源現況（來自文件／搜尋，**尚未實測**）

| 來源 | 目前知道的 | 風險 |
|---|---|---|
| BitoPro | 官方公開 REST，免登入，每 IP 600 次/分。用 `api.bitopro.com/v3/order-book/usdt_twd` 取 ask／bid，`/tickers/usdt_twd` 取最新成交價。文件摘要另提到 OTC 報價查詢。 | 低 |
| 玉山 | 沒找到官方公開 API，現有開源工具都是解析網頁。需用瀏覽器 DevTools 找頁面背後的 JSON。 | 中 |
| Binance Express | 找不到官方文件。唯一線索：Binance Skills Hub 的 P2P skill 列出免登入的 `www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price`（參數 fiat／asset／tradeType）。但不確定它等於 Express 頁的 Estimated price，回傳格式也沒查到；`/bapi/` 是內部路徑，隨時可能改。 | **高** |
| GolaVisa | 搜尋完全找不到該站資料；頁面結構、有沒有「更新時間」欄位都未知。 | 未知 |

## 6. 開發階段

### Phase 0｜資料來源探測（最重要，決定架構）

- 對每個來源確認：有沒有 JSON、欄位與買賣方向、時間戳、GitHub runner 連不連得到、瀏覽器 CORS、頻率限制與使用條款。
- 存下真實回應當測試資料（`fixtures/`），產出 `docs/data-sources.md`。
- 做法二選一：
  - **(a)** 使用者把四個網域加進雲端環境的 Allowed domains（session 標題列的環境選單 → Edit → Network access，[步驟](https://code.claude.com/docs/en/cloud-environments#network-access)），Claude 在 session 內直接測。
  - **(b)** 在開發分支推一個一次性的 probe workflow，讓 GitHub Actions 去打四個來源，Claude 讀 log。**建議 (b)**：它同時驗證「GitHub 的 IP 連不連得到」，比 (a) 更貼近正式環境。
- 驗收：四個來源都確定能取得機器可讀的資料，或已決定備案；時間戳語意清楚；架構（GitHub Actions 或加 Worker）定案。

### Phase 1｜骨架、GitHub 管控、空殼上線（可與 Phase 0 並行）

- Vite + TS 專案、lint／format／test、PR 必跑的 CI、Pages 部署 workflow、PR template、Dependabot。
- 使用者要在 GitHub 網頁設定一次：Settings → Pages → Source 選 **GitHub Actions**；再設 `main` 的保護規則。
- 驗收：手機打開 Pages 網址看得到頁面；開 PR 會跑 CI；合併到 `main` 會自動部署。

### Phase 2｜抓取層

- 4 個獨立 adapter、`rates.json` schema 驗證、合理範圍檢查（例如 USDT/TWD 不在 25–40 就拒收）。
- 單一來源失敗不影響其他，沿用上次值並標「過期」。
- 排程 workflow（含手動觸發）、連續失敗自動開 issue、keepalive。
- 驗收：資料自動更新；故意弄壞一個來源時，畫面顯示「資料過期」而不是錯誤數字。

### Phase 3｜計算引擎與畫面

- 純函式引擎 + 單元測試：用手算案例當黃金測資，買賣方向全覆蓋。
- 畫面：方向與金額輸入、路徑卡片、最划算標示、來源與時間、費用設定面板、「假設與不含項目」說明。
- 驗收：同一時刻與各來源頁面的「實得金額」對帳，誤差只有四捨五入。

### Phase 4｜選配

- 歷史走勢（資料存 `data` 分支）、價差達門檻通知、PWA（加到主畫面）。
- 納入 BitoPro 深度滑價。
- 把 TWD 與 CNY 路徑換成同一基準（相對中間價的成本 %），方便跨幣別比較。

## 7. GitHub 管控

- **流程**：功能分支 → PR → CI 綠燈 → squash 合併到 `main` → 自動部署。`main` 要求 PR 加 CI 通過。
- **追蹤**：用 Issues 和 Milestones 對應 Phase 0–4，完成一個階段就打 tag（v0.1…）。
- **金鑰**：不需要任何金鑰（來源都是公開行情）。不要把 token 放進 repo 或前端；開 Dependabot 與 secret scanning。
- **需要使用者在 GitHub 網頁手動設定**（Claude 無法操作 repo 設定）：Pages Source、`main` 保護規則。

## 8. 風險與對策

- **Binance Express 非官方**：可能被擋或改版。adapter 隔離，保存真實回應當測試。抓不到時顯示「資料不足」，不給錯誤結論。備案是 `quote-price` 或 P2P 價，並標明非 Express。
- **GolaVisa 可能有防爬或無結構**：最後手段是手動輸入欄位，使用者貼上當下數字，連同時間存在瀏覽器。
- **排程延遲**：顯示資料年齡並支援手動重跑；需要更即時再上 Worker。
- **買賣方向弄反**：最大的邏輯風險。§4 公式經使用者確認，再用單元測試鎖住。
- **條款與頻率**：低頻抓取（5 分鐘以上）、僅個人用途，公開網站只顯示計算結果並標註來源。結果僅供參考，不含銀行、交易所、鏈上手續費與滑價（除非在設定面板填入）。

## 9. 待確認事項

沒有回覆時使用預設值。

| # | 問題 | 預設 | 狀態 |
|---|---|---|---|
| 1 | Phase 0 探測方式：(a) 放行網域，或 (b) GitHub Actions probe | (b) | 待回覆 |
| 2 | 能接受「幾分鐘前的快照 + 資料年齡」嗎？ | 接受；需要更即時再加 Worker | 待回覆 |
| 3 | 手續費納入範圍：BitoPro 是掛單還是「一鍵買賣」？銀行匯款費、USDT 提領網路費要不要預設納入？ | 只計 Binance 0.1% | 待回覆 |
| 4 | 試算金額預設值 | TWD 30,000／CNY 7,000／VND 10,000,000 | 待回覆 |
| 5 | 介面語言 | 繁體中文 | 預設 |

## 10. 參考資料

- [BitoPro 官方 API 文件](https://github.com/bitoex/bitopro-official-api-docs)
- [Binance Skills Hub](https://developers.binance.com/en/docs/sdks-tools/tools/skills-hub)（P2P skill 的 `quote-price` 端點）
- [玉山匯率解析工具參考（CPAN）](https://mirrors.ircam.fr/pub/CPAN/modules/by-module/Finance/Finance-Currency-Convert-Esunbank-v0.1.1.readme)
- [GitHub Pages 限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- [GitHub 方案比較](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
- [Rulesets 可用範圍](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [GitHub Actions 排程行為](https://cronuru.com/guides/github-actions-scheduled-workflows)
- [Workflow keepalive 範例](https://github.com/efrecon/gh-action-keepalive)
