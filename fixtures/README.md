# fixtures

Real responses captured from each data source on 2026-10-08 (about 16:30 Asia/Taipei) by the
Phase 0 probe running on a GitHub-hosted runner. They are test inputs for the source adapters
(Phase 2) and must stay verbatim, so Prettier ignores this directory.

- `esun/last-rate-info.trimmed.json` is **trimmed**: only the `USD/TWD` and `CNY/TWD` entries are
  kept, and the top-level `Time`, `Date`, `Count`, `Clear` keys were not captured. Replace it with
  a full capture once the fetch job exists.
- Field meanings and endpoints are documented in [`docs/data-sources.md`](../docs/data-sources.md).

- `golavisa/exchange-rates.sample.json` was **not captured by us** (the API is behind a Vercel challenge). It is rebuilt from the structure and values the user copied from their own browser on 2026-10-08, trimmed to USD/TWD with `shops` omitted.
