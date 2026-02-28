# Float Exchange — Upcoming Features

> What makes Float different from every other perps DEX on Solana.

---

## Overview

Float isn't just another Drift fork. We're building a full-stack perpetuals exchange with features that don't exist anywhere else — combining a token launchpad, open market making, optional privacy, and a revenue-sharing equity token that pays holders directly from exchange fees.

---

## 1. Graduation Perps — Launchpad → Perpetuals Pipeline

### The Problem

On most launchpads (Pump.fun, Jupiter Launch, etc.), a token launches, hype peaks, and then there's nowhere for serious traders to go. There's no derivatives market, no leverage, no shorts. The token either pumps and dumps or slowly bleeds with no way to express a directional view beyond spot.

### The Solution

Float introduces **Graduation Perps** — a pipeline where tokens that hit critical mass on our launchpad automatically graduate into a full perpetual futures market.

**How it works:**

1. **Launch Phase** — A project launches their token on Float's integrated launchpad (bonding curve, fair launch, or seed round).
2. **Metrics Gate** — Once a token hits graduation thresholds (e.g., $500K market cap, 1,000+ holders, sustained volume), it becomes eligible.
3. **Perp Market Creation** — Float deploys a new perpetual market for the token with:
   - A Prelaunch Oracle seeded from the spot price
   - Initial AMM liquidity bootstrapped from protocol reserves
   - Conservative margin requirements that relax as the market matures
4. **Live Trading** — Traders can now go long or short with leverage on a token that was just a launchpad meme 48 hours ago.

### Why This Matters

- **For projects:** Your token gets a derivatives market — institutional-grade infrastructure — without begging a CEX for a listing.
- **For traders:** Short the overvalued hype tokens. Hedge your spot bags. Express any view with leverage.
- **For the ecosystem:** Capital efficiency goes up. Price discovery improves. Float becomes the destination for every new Solana token.

> No other exchange offers a direct pipeline from launch to leveraged trading.

---

## 2. Open Market Making — Keeper Bot Access for Everyone

### The Problem

On centralized exchanges, market making is a closed club — you need millions in capital, a co-located server, and a relationship with the exchange. On most DEXs, the AMM does everything and regular users can't participate in the spread.

### The Solution

Float opens up market making to anyone through our **Keeper Bot system**. Three specialized bots power the exchange, and anyone can run them to earn fees:

| Bot | Role | What It Earns |
|-----|------|---------------|
| **Maker Bot** | Places resting limit orders on both sides of the book, providing liquidity and tightening spreads | Maker rebates + equity token rewards |
| **Filler Bot** | Matches and executes incoming orders against the orderbook and AMM | Filler incentive fees per fill |
| **Liquidator Bot** | Monitors under-collateralized positions and liquidates them to keep the system solvent | Liquidation bonus (% of position) |

### How Users Participate

1. **Run a bot** — Deploy one of our open-source keeper bots with your own capital. Configuration is straightforward: pick a market, set your risk parameters, point it at an RPC.
2. **Earn fees** — Every fill, every liquidation, every spread captured pays you directly.
3. **Earn equity** — On top of direct fees, keepers earn $FLOAT equity tokens proportional to their contribution (see Section 4).

### Why This Matters

- Market making becomes **permissionless** — anyone with a VPS and some SOL can participate
- More keepers = tighter spreads = better execution for traders
- Keepers are economically aligned with the exchange's success through equity rewards

---

## 3. Arcium Private Perp Trades (Optional)

### The Problem

Every trade on Solana is public. Your entries, your exits, your position sizes — all visible on-chain. MEV bots front-run you. Competitors see your strategy. Large traders can't build positions without moving the market against themselves.

### The Solution

Float integrates **Arcium's confidential computing network** as an optional privacy layer for perpetual trades.

**When a trader enables private mode:**

- **Order details are encrypted** — price, size, and direction are hidden from the public mempool
- **Execution happens in a secure enclave** — Arcium's MPC (Multi-Party Computation) nodes process the trade without revealing inputs
- **Settlement is on-chain** — the final state update hits Solana as normal, but observers only see the result, not the intent

### Trade Flow

```
Trader submits encrypted order
        ↓
Arcium MPC nodes decrypt & match in secure enclave
        ↓
Matched trade result sent to Float smart contract
        ↓
On-chain settlement (position update, margin adjustment)
        ↓
Public sees: "Position changed" — not the order details
```

### This Is Optional

Not every trade needs privacy. For standard trades, Float works exactly like any other perps DEX — fast, transparent, on-chain. Arcium mode is a toggle for traders who need it:

- **Whales** building large positions without signaling
- **Funds** executing strategy without leaking alpha
- **Anyone** who doesn't want their PnL and positions public

### Why This Matters

- First perps DEX on Solana with **optional trade privacy**
- No MEV extraction on private trades
- Institutional-grade execution without a CEX

---

## 4. $FLOAT Equity Token — Revenue Sharing via Smart Contract

### The Problem

On most exchanges, users generate all the volume and the exchange keeps all the profit. Even exchanges with "governance tokens" rarely share actual revenue — you get voting rights on proposals nobody reads.

### The Solution

Float deploys a **$FLOAT equity token** via smart contract that entitles holders to a direct share of exchange revenue. This isn't a governance token. This is equity. Real fees, distributed on-chain, automatically.

### Fee Split Model

Every trade on Float generates fees. Those fees are split three ways:

```
Trade Fee (e.g., $10 per trade)
├── 30%  →  Protocol Treasury     ($3.00)
│           Operations, development, growth
│
├── 20%  →  Keeper Rewards        ($2.00)
│           Maker, Filler, and Liquidator bots
│           that powered the trade
│
└── 50%  →  $FLOAT Holders        ($5.00)
            Distributed pro-rata to all
            token holders via smart contract
```

### How It Works

1. **Fee Collection** — Every trade's fee is collected by the Float program
2. **Automatic Split** — The smart contract splits fees into three buckets in real-time
3. **Holder Distribution** — The 50% holder share accrues in a reward pool
4. **Claim or Compound** — $FLOAT holders can claim their share anytime, or let it compound

### Earning $FLOAT

There are two ways to earn equity:

| Method | How | Who |
|--------|-----|-----|
| **Keeping** | Run a Maker, Filler, or Liquidator bot — earn $FLOAT proportional to your activity | Bot operators, technical users |
| **Holding** | Hold $FLOAT — earn a share of the 50% fee pool automatically | Anyone, fully passive |

This creates a **flywheel**:

```
More keepers → Better execution → More traders
     ↑                                    ↓
More $FLOAT value ← More fees → More holder rewards
```

### Smart Contract Mechanics

- **Fixed supply** — $FLOAT has a capped supply, no infinite minting
- **On-chain distribution** — Fee splits are enforced by the program, not by a team multisig
- **Transparent** — Every fee, every split, every distribution is verifiable on-chain
- **No lock-ups for earned tokens** — Keepers receive $FLOAT as they work; holders receive fees as they accrue

### Why This Matters

- **Real yield** — not emissions, not inflationary rewards, actual exchange revenue
- **Alignment** — everyone who contributes (keepers, traders generating volume, holders providing capital) gets paid
- **Trustless** — smart contract enforces the split, not a promise on a website

---

## Feature Comparison

| Feature | Float | Drift | Jupiter Perps | Hyperliquid | dYdX |
|---------|-------|-------|---------------|-------------|------|
| Graduation Perps (launch → perp) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open Keeper Market Making | ✅ | Partial | ❌ | ❌ | ❌ |
| Optional Private Trades (Arcium) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Revenue-Sharing Equity Token | ✅ | ❌ | ❌ | ❌ | ❌ |
| On-chain Fee Distribution | ✅ | ❌ | ❌ | ❌ | ❌ |
| Permissionless Perp Listings | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Roadmap

| Phase | Target | Deliverables |
|-------|--------|-------------|
| **Phase 1 — Foundation** | Q1 2026 | Core perps exchange live on devnet. Maker, Filler, Liquidator bots operational. Frontend trading UI. |
| **Phase 2 — Graduation Perps** | Q2 2026 | Launchpad integration. Automated perp market creation pipeline. Prelaunch oracle system for new tokens. |
| **Phase 3 — $FLOAT Token** | Q2 2026 | Equity token deployment. Fee-split smart contract. Keeper reward distribution. Holder claim interface. |
| **Phase 4 — Arcium Integration** | Q3 2026 | Optional private trade mode. Arcium MPC integration. Encrypted order submission. |
| **Phase 5 — Mainnet** | Q3 2026 | Full mainnet deployment. Open keeper onboarding. Public $FLOAT distribution. |

---

## Summary

Float is building the exchange that should already exist:

- **Graduation Perps** — Launch a token, graduate it to a leveraged market. No gatekeepers.
- **Open Market Making** — Anyone can be a keeper, earn fees, tighten spreads.
- **Arcium Privacy** — Trade without the whole chain watching. Optional, powerful.
- **$FLOAT Equity** — Hold the token, earn 50% of all exchange fees. Real revenue, on-chain, automatic.

Every other perps DEX takes your fees and keeps them. Float gives them back.
