# Float Exchange

A perpetual futures exchange built on Solana, forked from [Drift Protocol](https://github.com/drift-labs/protocol-v2).

**Live on Solana Devnet** — http://95.217.193.241:5174

---

## Architecture

```
Frontend (React + Vite)          :5174
    │
    ├── Drift SDK (wallet + trading)
    ├── Order Book ← value-dlob   :6969
    └── Price Feed ← value-oracle (Binance)
    │
    ▼
Drift Protocol (Devnet)
    ├── USDC Spot Market (index 0)
    └── SOL-PERP Market  (index 0)
    ▲
    ├── value-filler     (order execution)
    └── value-liquidator (risk management)
```

## Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Drift Protocol v2 (Anchor/Rust) on Solana Devnet |
| Backend | PM2-managed Node.js services on Hetzner |
| Frontend | React 18 + Vite + Tailwind + Zustand |
| Order Book | DLOB server + Redis |
| Price Feed | Custom oracle updater (Binance → on-chain) |
| Keeper Bots | Filler + Liquidator (from drift-labs/keeper-bots-v2) |

## Key Addresses (Devnet)

| Asset | Address |
|-------|---------|
| Drift Program | `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE` |
| USDC Mint | `4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn` |
| SOL Oracle | `8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG` |
| Admin | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |

## Project Structure

```
├── protocol-v2/          Drift smart contract (deployed)
├── frontend/             React trading UI
├── dlob-server/          Decentralized limit order book server
├── keeper-bots-v2/       Filler + liquidator bots
├── drift-common/         Shared utilities
├── scripts/              Init, oracle updater, seed vault
├── keys/                 Operator keypairs
└── ecosystem.config.js   PM2 service definitions
```

## Documentation

| File | Purpose |
|------|---------|
| [PROGRESS.md](PROGRESS.md) | Current status and remaining work |
| [KEEPER-BOTS-GUIDE.md](KEEPER-BOTS-GUIDE.md) | Keeper bot types, config, and operations |
| [FRONTEND-GETTING-STARTED.md](FRONTEND-GETTING-STARTED.md) | Frontend architecture and dev guide |
| [BACKUP-RESTORE.md](BACKUP-RESTORE.md) | Server backup and recovery procedures |
| [docs/wallet-addresses.md](docs/wallet-addresses.md) | Operator wallet directory |

## Quick Commands (Server)

```bash
pm2 list                          # All services
pm2 logs value-oracle --lines 20  # Oracle feed
pm2 logs value-filler --lines 20  # Order filler
pm2 restart all                   # Restart everything
```

## Local Development

```bash
cd frontend && npm install && npm run dev   # Start frontend locally
node scripts/init-drift-devnet.mjs          # Re-initialize protocol
```

