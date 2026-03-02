# Value Exchange — Progress Report

**Last updated:** February 27, 2026  
**Network:** Solana Devnet  
**Server:** Hetzner (95.217.193.241)  
**Frontend:** http://95.217.193.241:5174

---

## On-Chain Program & State

| Item | Status | Details |
|------|--------|---------|
| Drift Protocol deployed | ✅ Done | `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE` on devnet |
| Clearing House initialized | ✅ Done | State account created, admin = `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |
| USDC spot market (index 0) | ✅ Done | Mint: `4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn` (custom devnet USDC, 6 decimals) |
| SOL-PERP market (index 0) | ✅ Done | 10x max leverage, 5% maintenance margin, 1hr funding period |
| Prelaunch oracle (SOL) | ✅ Done | `8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG` — self-managed price feed |
| Vault seeded | ✅ Done | Admin deposited USDC liquidity |

## Backend Services (PM2 on Hetzner)

| Service | PM2 Name | Status | Notes |
|---------|----------|--------|-------|
| Oracle Updater | `value-oracle` | ✅ Running | Pushes live Binance SOL price every ~10s (6,300+ updates). Occasional "already processed" tx errors (harmless — devnet dedup). `peg=skip-thr` means peg updates are throttled when price hasn't moved enough. |
| Order Filler | `value-filler` | ✅ Running | Polling every 6s. 0 fillable orders (no trades placed yet). Healthy. |
| Liquidator | `value-liquidator` | ⚠️ Running with errors | Checking 8 users every 5s, 0 liquidatable. **Error:** `Attempt to debit an account but found no record of a prior credit` — the liquidator's keeper wallet needs devnet SOL to pay rent for user account initialization. |
| DLOB Server | `value-dlob` | ⚠️ Degraded | Switched to Helius devnet RPC (`devnet.helius-rpc.com`). Previously had timeouts to `api.devnet.solana.com:443`. Restart PM2 to pick up new endpoint. |
| Frontend | `value-frontend` | ✅ Running | Vite dev server on port 5174 (`http://95.217.193.241:5174`). No errors. |
| Redis | (system service) | ✅ Running | PONG confirmed. Used by DLOB server for order caching. |

## Frontend UI

| Component | Status | Notes |
|-----------|--------|-------|
| Wallet connect (Phantom) | ✅ Built | Solana wallet-adapter with modal |
| Price chart | ✅ Built | `PriceChart.tsx` — lightweight-charts |
| Order book | ✅ Built | `OrderBook.tsx` — displays bids/asks |
| Trade form | ✅ Built | `TradeForm.tsx` — long/short, market/limit orders, leverage slider |
| Recent trades feed | ✅ Built | `RecentTrades.tsx` + `useTradeSubscriber` hook for on-chain fill events |
| Account panel | ✅ Built | `AccountPanel.tsx` — balances, positions, PnL |
| Bottom panel | ✅ Built | `BottomPanel.tsx` — open orders, trade history |
| User management | ✅ Built | `UserManagement.tsx` + `UserAccountSelector.tsx` — sub-accounts |
| Market bar | ✅ Built | `MarketBar.tsx` — mark price, 24h change, funding rate |
| Docs page | ✅ Built | `DocsPage.tsx` |
| SDK wrapper | ✅ Built | `drift-client-wrapper.ts` — DriftClient abstraction with openPosition, closePosition, deposit, withdraw |
| Zustand store | ✅ Built | `useDriftStore.ts` — central state management |
| Read-only mode | ✅ Built | `useReadOnlyDrift.ts` — market data without wallet |
| Mobile responsive layout | ✅ Built | Tab-based views for small screens |

## Keeper Bot Configuration

| Config | Value |
|--------|-------|
| Filler polling interval | 6,000ms |
| Liquidator market indices | perp: [0], spot: [0, 1] |
| Max slippage (derisking) | 50 bps |
| Priority fee method | Solana native |
| Max priority fee | 1,000 microlamports |
| Tx sender | Retry (30s timeout) |
| Jito bundle | Disabled |

---

## What Still Needs to Be Done

### Priority 1 — Fix Current Issues

- [ ] **Fund liquidator keeper wallet** — needs devnet SOL so it can initialize its user account and execute liquidations
- [x] **Fix DLOB RPC timeouts** — replaced `api.devnet.solana.com` with Helius devnet RPC across all services
- [ ] **Oracle peg updates throttled** — the oracle pushes price but AMM peg isn't updating (either by design to save tx fees, or the peg-update threshold needs adjustment)

### Priority 2 — Additional Markets

- [ ] **BTC-PERP** (market index 1) — add Prelaunch oracle + initializePerpMarket
- [ ] **ETH-PERP** (market index 2) — add Prelaunch oracle + initializePerpMarket
- [ ] Update oracle-updater to push BTC/ETH prices from Binance
- [ ] Update frontend config.ts with new market entries
- [ ] Update filler/liquidator configs with new market indices

### Priority 3 — Frontend Polish

- [ ] **Production build** — switch from `vite dev` to `vite build` + static serving (nginx/caddy) for better performance
- [ ] **Custom domain** — point a domain at 95.217.193.241 + HTTPS via Let's Encrypt
- [ ] **USDC faucet for testers** — devnet faucet endpoint so users can get test USDC without admin minting
- [ ] **Error handling** — improve wallet disconnect, RPC failure, and tx rejection UX
- [ ] **Trade notifications** — verify sonner toasts fire correctly on fill events
- [ ] **Loading states** — skeleton UI while SDK subscribes

### Priority 4 — Infrastructure Hardening

- [x] **Dedicated RPC** — Helius devnet RPC configured across all services (fixes DLOB + reduces oracle errors)
- [ ] **Nginx reverse proxy** — front the Vite server + DLOB API behind nginx with proper headers
- [ ] **PM2 ecosystem.config.js** — add filler + liquidator to ecosystem file (currently started separately)
- [ ] **Monitoring/alerts** — PM2 metrics or simple uptime checks for the 5 services
- [ ] **Log rotation** — PM2 log rotate module to prevent disk fill

### Priority 5 — Advanced Features

- [ ] **Insurance fund** — initialize + seed the Drift insurance fund for vault protection
- [ ] **Funding rate display** — show live funding rate on frontend (data exists in AMM account)
- [ ] **Spot trading** — enable spot deposits/withdrawals beyond USDC
- [ ] **JIT Maker bot** — add just-in-time liquidity provision (config exists in keeper-bots-v2)
- [ ] **Mainnet deployment** — deploy to Solana mainnet (requires real SOL, security audit, real Pyth oracles)

---

## Architecture Overview

```
Users (Phantom Wallet)
    │
    ▼
┌─────────────────────────────┐
│  value-frontend (Vite)      │  :5174
│  React + Drift SDK          │
│  Wallet Adapter + Zustand   │
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────────────┐
    ▼          ▼                  ▼
┌─────────┐ ┌──────────┐ ┌──────────────┐
│ Devnet  │ │ value-   │ │ value-dlob   │ :6969
│ RPC     │ │ oracle   │ │ (order book  │
│         │ │ (Binance │ │  + Redis)    │
│         │ │  → chain)│ └──────────────┘
└────┬────┘ └──────────┘
     │
     ▼
┌─────────────────────────────────┐
│  Drift Protocol (Devnet)        │
│  EvKyHhY...5eXE                 │
│                                 │
│  ┌──────────┐  ┌──────────────┐ │
│  │ USDC     │  │ SOL-PERP     │ │
│  │ Spot (0) │  │ Perp (0)     │ │
│  └──────────┘  └──────────────┘ │
└─────────────────────────────────┘
     ▲          ▲
     │          │
┌─────────┐ ┌──────────────┐
│ value-  │ │ value-       │
│ filler  │ │ liquidator   │
└─────────┘ └──────────────┘
```

## Key Addresses

| Asset | Address |
|-------|---------|
| Drift Program | `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE` |
| Admin Wallet | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |
| USDC Mint | `4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn` |
| SOL Oracle | `8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG` |

---

## Summary

**Overall completion: ~70%**

The core exchange is functional — protocol deployed, clearing house initialized, SOL-PERP market live with real-time Binance pricing, keeper bots running, and a full trading UI served from the Hetzner server. The main gaps are RPC reliability (DLOB timeouts), liquidator funding, additional trading pairs, and production-hardening (nginx, HTTPS, domain, monitoring).
