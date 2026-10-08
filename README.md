# 換匯比較面板

比較 TWD／CNY ⇄ VND 經 USDT、經 USD、直換的實得匯率，標出哪種方式最划算。
靜態網頁，部署在 GitHub Pages：<https://dennyhty.github.io/currency-exchange/>（在 repo 設定啟用 Pages 後可用）。

目前進度：Phase 1（專案骨架）。

- 計畫與公式：[docs/PLAN.md](docs/PLAN.md)
- 資料來源探測結果：[docs/data-sources.md](docs/data-sources.md)
- 開發進度與工作規則：[CLAUDE.md](CLAUDE.md)

## 開發

需要 Node.js 22（見 `.nvmrc`）。

```sh
npm ci            # 安裝
npm run dev       # 開發伺服器（網址含 /currency-exchange/）
npm run check     # lint + typecheck + format + test + build，PR 前先跑
npm test          # 單元測試
```

## 流程

功能分支 → PR → CI 通過 → squash 合併到 `main` → 自動部署到 GitHub Pages。
