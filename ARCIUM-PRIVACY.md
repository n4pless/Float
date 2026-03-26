# Arcium Privacy Integration

Float Exchange integrates [Arcium](https://arcium.com/)'s confidential computing network to offer **optional private perpetual trades**. Standard trades remain fully transparent on-chain; privacy is an opt-in feature per order.

---

## Problem

All Solana transactions are publicly visible. Traders placing large orders on-chain expose their intent to front-runners, MEV bots, and competitors before execution settles. This discourages institutional participation and penalises whale-size positioning.

## Solution

Arcium's Multi-Party Computation (MPC) network enables encrypted order submission and matching. No single node in the network ever sees the full order data — computation happens inside a secure enclave across multiple MPC nodes.

---

## How It Works

```
Trader                    Arcium MPC Network             Float Contract (On-Chain)
  │                              │                                │
  │  1. Encrypted order          │                                │
  │  (price, size, direction)    │                                │
  │ ──────────────────────────►  │                                │
  │                              │  2. Nodes jointly decrypt      │
  │                              │     & match in secure enclave  │
  │                              │                                │
  │                              │  3. Settlement instruction     │
  │                              │ ──────────────────────────────►│
  │                              │                                │
  │  4. Position update visible  │                                │
  │◄─────────────────────────────────────────────────────────────│
  │  (order intent stays hidden) │                                │
```

### Step-by-Step

1. **Encrypted Submission** — The trader's order (price, size, direction) is encrypted client-side before leaving the browser. The cleartext never touches the public mempool.
2. **MPC Decryption & Matching** — Arcium's distributed MPC nodes jointly decrypt and match orders inside a secure enclave. No single node holds the full plaintext.
3. **On-Chain Settlement** — The matched result is sent as a standard instruction to Float's on-chain program. The chain records the position update, not the original order intent.
4. **Position Visible, Intent Hidden** — The public ledger shows the resulting position change but not the trader's entry price, liquidation price, or order direction (depending on shield settings).

---

## Privacy Shields

Traders can granularly control what remains hidden using **Arcium Shields**:

| Shield | What It Hides |
|---|---|
| **MPC Encryption** | Order intent (price, size, direction) during submission |
| **Hide Entry Price** | Entry price on the resulting position |
| **Hide Liquidation Price** | Liquidation price on the resulting position |

Shields are independent toggles — a trader can hide their liquidation price while leaving entry price visible, or enable full privacy across all fields.

### On-Chain Visibility Comparison

| Data Point | Standard Trade | Private Trade (All Shields) |
|---|---|---|
| Order Intent | Visible | **Shielded** |
| Position Size | Visible | Visible |
| Entry Price | Visible | **Shielded** |
| Liquidation Price | Visible | **Shielded** |
| Direction | Visible | **Shielded** |
| Settlement Result | Visible | Visible |

---

## Fee Structure

| Trade Type | Fee |
|---|---|
| Standard | 0.05% |
| Private (Arcium) | 0.08% |

The 0.03% privacy premium covers the cost of MPC computation and Arcium network fees.

---

## Who It's For

- **Whales** — Open or close large positions without signalling intent to the market.
- **Funds & Institutions** — Trade with the same on-chain settlement guarantees while keeping strategy confidential.
- **Any Trader** — Anyone who wants their order flow private. The feature is optional and available on every trade.

---

## Current Status

| Component | Status |
|---|---|
| UI components & trade panel | ✅ Complete (demo/concept) |
| Privacy order type (`'privacy'`) | ✅ Defined |
| Arcium Shield toggles | ✅ Implemented in UI |
| Feature page documentation | ✅ Live |
| Arcium MPC network integration | ⏳ Pending |
| Order encryption/decryption | ⏳ Pending |
| Secure enclave communication | ⏳ Pending |
| Private order execution | ⏳ Pending |

**Target**: Phase 4 — Q3 2026

---

## Key Files

| File | What |
|---|---|
| `frontend/src/components/TradeForm.tsx` | Privacy trade panel, shield toggles, order preview |
| `frontend/src/pages/FeaturesPage.tsx` | Arcium privacy feature section & roadmap |
| `frontend/src/pages/InfoPage.tsx` | Marketing references |
| `docs/float-upcoming-features.md` | Technical specification & trade flow |

---

## Design Principles

- **Opt-in, not default** — Standard trades are unaffected. Privacy is a per-order choice.
- **No dark pool** — Private orders route through the same matching engine and on-chain program. There is no separate hidden order book.
- **Verifiable settlement** — All settlements post on-chain. The chain always records the final position state.
- **Granular control** — Traders choose exactly which data points to shield rather than all-or-nothing privacy.
