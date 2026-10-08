# 資料來源探測結果（Phase 0）

> 探測時間：2026-10-08 週四，台北時間約 16:30。環境：GitHub-hosted runner（ubuntu-24.04，Azure 美國 IP）。
> 真實回應範例在 [`fixtures/`](../fixtures/README.md)。探測腳本在 git 歷史（commit `24a12ff`、`7868d02` 的 `scripts/probe/`）。

## 總覽

| 來源 | 取得方式 | GitHub runner 可連 | 瀏覽器直接呼叫（CORS） | 結論 |
|---|---|---|---|---|
| BitoPro | 官方公開 REST（GET） | ✅ | ✅ `*`，preflight 也通過 | 瀏覽器即時抓 |
| Binance Express 價格 | `agent/quote-price`（GET） | ✅ 不需瀏覽器 | ✅ `*` | 瀏覽器即時抓 |
| Binance Express 費率 | `commission-rate/taker`（POST） | ✅ | ❌ 無 CORS 標頭 | 排程快照（很少變動） |
| 玉山 即期匯率 | `LastRateInfo`（POST，空 body） | ✅ | ❌ 無 CORS 標頭 | 排程快照 |
| GolaVisa | `GET /api/exchange-rates`（JSON） | ❌ Vercel 檢查站（HTTP 429） | 未測 | 使用者貼上 JSON（見 §4） |

## 1. BitoPro（USDT/TWD）

- `GET https://api.bitopro.com/v3/order-book/usdt_twd?limit=5` → `bids[]`／`asks[]`，每筆 `price, amount, count, total`（字串）。
  買 USDT 吃最低 `asks[0].price`，賣 USDT 吃最高 `bids[0].price`。探測時 bid 31.978／ask 31.988。
- `GET /v3/tickers/usdt_twd` → `data.lastPrice` 等（最新成交價，僅供參考）。
- `GET /v3/price/otc/usdt` →「一鍵買賣」報價：`buySwapQuotation.twd.exchangeRate`（你買，32.118964）、`sellSwapQuotation.twd.exchangeRate`（你賣，31.849092）。價差比掛單簿寬。
- 公開端點免登入，每 IP 600 次/分鐘（官方文件）。
- 手續費（`/v3/provisioning/limitations-and-fees`，預設等級）：掛單 maker 0.1%、吃單 taker 0.2%；用 BITO 抵扣為 0.08%／0.16%。TWD、USDT 入金費 0。**USDT 提領網路費尚未取得。**
- 待使用者確認：實際是用掛單簿還是「一鍵買賣」。

## 2. 玉山銀行（USD/TWD 即期）

- `POST https://www.esunbank.com/api/client/ExchangeRate/LastRateInfo?sc_lang=zh-TW`，body 留空。GET 會回 500。
- 回應 `{ DiscontFlag, Rates[16], Time, Date, Count, Clear }`。`Rates[].CCY === "USD/TWD"` 這筆：
  - `BBoardRate`＝**即期 銀行買入**（31.85）、`SBoardRate`＝**即期 銀行賣出**（31.95）
  - `CashBBoardRate`／`CashSBoardRate`＝現金買入／賣出（不用）
  - `BuyIncreaseRate`／`SellDecreaseRate`＝網銀／App 優惠（不用）
  - `UpdateTime`＝`/Date(毫秒)/`，例 `/Date(1791448520000)/` ＝ 2026-10-08T08:35:20Z（台北 16:35:20）。
- 與頁面表格一致；頁面標示「資料日期：2026年10月08日 16:29:40」。觀察到來源每約 20 秒更新。
- 回應沒有 `access-control-allow-origin`，瀏覽器跨網域讀不到，只能在伺服器端（Actions）抓。
- 待觀察：非營業時間與週末的 `UpdateTime` 行為；`DiscontFlag` 的意義。

## 3. Binance C2C Express

- 價格：`GET https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VND&asset=USDT&tradeType=BUY`
  → `data.price`。`tradeType=BUY` ＝「Buy USDT with 法幣」頁（你付法幣買 USDT），`SELL` ＝「Sell USDT with 法幣」頁。
  四組數字與 Express 頁面的 "Estimated price" 完全一致：

  | 法幣 | BUY | SELL |
  |---|---|---|
  | VND | 25,986 | 26,162 |
  | CNY | 6.65 | 6.67 |

- 同樣的數字也可由 `POST https://c2c.binance.com/bapi/c2c/v2/public/c2c/adv/quoted-price`（頁面自己用的）取得，欄位 `data[0].referencePrice`。請求不含金額，所以價格與金額無關。
- 兩者都免登入、不被 AWS WAF 擋、回應 `access-control-allow-origin: *`。只有 Express **HTML 頁面**會先出 WAF 的 JS 驗證（HTTP 202）。
- 費率：`POST https://c2c.binance.com/bapi/c2c/v1/friendly/c2c/commission-rate/taker`，body `{"channel":"c2c","area":"express","asset":"USDT","fiat":"VND"}`
  → VND 買、賣都是 0.1%（`commissionRate: "0.00100000"`），CNY 是 0。與你指定的 0.1%（VND）、CNY 不計費一致。無 CORS 標頭。
- Express 頁面註明單筆限額 ₫150,000–₫1,500,000,000（VND）。
- ⚠️ 這是「預估價」：VND 的 BUY（25,986）低於 SELL（26,162），買賣價倒掛，等於 P2P 最佳掛單的預估，實際成交可能較差。畫面要標明，並請以 Binance 下單頁為準。
- `/bapi/` 是 Binance 網站的內部路徑，可能改版；`agent/` 這組出現在 Binance Skills Hub。要用 fixtures 與測試保護，並在數字異常時顯示「資料不足」。

## 4. GolaVisa

- 頁面背後是 `GET https://www.golavisa.co/api/exchange-rates`（Next.js 內部 API，由使用者在自己的瀏覽器查到；`Cache-Control: no-store`）。
- 從 GitHub runner 呼叫（plain curl、帶瀏覽器 UA）也是 HTTP 429、`x-vercel-mitigated: challenge`，頁面與 API 都被 Vercel 檢查站擋住。**不做繞過。**
- 在使用者自己的瀏覽器直接開這個網址是正常的，回傳 JSON，所以面板採用「使用者貼上 JSON」：打開該網址 → 全選複製 → 貼到面板 → 面板解析並存起來。
- 回應結構（範例見 `fixtures/golavisa/exchange-rates.sample.json`）：
  - `snapshot.rates`：Hung Long 換匯店，`USD`、`TWD`，每個有 `sell`、`buy_cash`、`buy_transfer`，單位都是「1 外幣 = N VND」。
  - `snapshot.bank_rates`：Vietcombank 牌價（USD、CNY 等，沒有 TWD）。
  - 時間：`hung_long_updated_at`、`bank_updated_at`、`updated_at`（UTC ISO）。Hung Long 約每個工作日更新一次。
- 欄位對應（你拿東西給店家＝店家「買入」）：

  | 路徑中的一步 | 用的欄位 |
  |---|---|
  | TWD → VND | `rates.TWD.buy_cash`（或 `buy_transfer`） |
  | VND → TWD | `rates.TWD.sell`（1 TWD 要多少 VND） |
  | USD → VND | `rates.USD.buy_cash`（或 `buy_transfer`） |
  | VND → USD | `rates.USD.sell`（1 USD 要多少 VND） |

  探測當天數字：TWD 買 781／賣 810；USD 買 25,960／賣 26,110。與頁面計算機規則一致（TWD、USD 用 Hung Long）。
- 這是 Gola 前端的內部 API，欄位可能變動；解析要防欄位缺漏，缺了就顯示「資料不足」。
- 待確認：貼上的資料要存在該裝置的瀏覽器，還是存在 repo 資料檔（跨裝置共用）。

## 5. 對架構的影響

- 不需要 Cloudflare Worker：三個可抓的來源 GitHub runner 都連得到。
- 即時價格（BitoPro、Binance）由瀏覽器直接抓；排程 Actions 只負責玉山、Binance 費率，並保存其他來源的備援快照。
- 玉山更新頻率高但匯價變動慢，5–15 分鐘的快照可接受，畫面顯示資料年齡。
