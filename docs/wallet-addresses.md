# Float Exchange — Wallet Address Directory

> **Network:** Solana Devnet  
> **Last Updated:** February 26, 2026

---

## Operator Wallets

These are controlled by keypair files stored on the server (`~/Drift-Clone/keys/`).

| Role | Public Key | Keypair File | SOL Balance |
|------|-----------|--------------|-------------|
| **Admin / Upgrade Authority** | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` | `keys/admin-keypair.json` | ~50.54 SOL |
| **Filler Bot** | `66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK` | `keys/filler-keypair.json` | ~0.96 SOL |
| **Liquidator Bot** | `D9k5Mo7YLBoQi7prKyVrfc9xKFRmJYzh2vifnuzuYNGX` | `keys/liquidator-keypair.json` | ~3.97 SOL |

> **Security Note:** The admin keypair is the most critical — it serves as both the protocol admin and the program upgrade authority. All 3 keypair files are stored on the Hetzner server.

---

## Program Accounts

| Account | Address |
|---------|---------|
| **Drift Program** | `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE` |
| **Program Data** | `2pAqZGKRcXum6QvhSqtNEWJkx4arKvqdSPbYbhkG7HMk` |
| **Upgrade Authority** | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |

- Binary size: 6.66 MB
- Program data rent: 46.38 SOL

---

## Protocol PDAs (Program-Derived Addresses)

These addresses are deterministically derived from the program ID. They cannot be changed or reassigned.

| Account | Address |
|---------|---------|
| **State** | `87Qoav8o4zqca6YzPiqucFD8defemigmFEzzMCKdC4Rx` |
| **Drift Signer** (vault authority) | `8cz31TTQd9efYso5LeiNgimzVrCxcBGwC5PWhfDszvoj` |

---

## Market Accounts (PDAs)

| Market | Address |
|--------|---------|
| **SOL-PERP** (perp index 0) | `EVCLDKxHxtmhc6kPpBZwH1JcNFhxpq4djFDd19YMsNoB` |
| **Spot market #0** (USDC) | `9oRp7zUURzDPegfGUFTsDfPk2k6aGXE2LZKKhqnmkjVf` |
| **Spot market #1** | `5YSsofRS981d8zbEg3XnSZrBNB5XTNRoegPNbLSEJiDE` |
| **Spot market #2** | `622a9MwHD8eY6vWDtaRMM8uaXc5hv99Rpi6xndDkFjSn` |

---

## Vault Accounts (PDAs — Token Custody)

All user deposits and protocol funds are held in these PDA-controlled token accounts. Only the Drift Signer PDA can authorize withdrawals via program instructions.

| Vault | Address | Balance |
|-------|---------|---------|
| **Spot vault #0** (USDC) | `5bHrFM7xbmTsw52CFM5uFXThM6jgXyBhfDWSksyUAWkS` | ~3,016,531 USDC |
| **Spot vault #1** | `8CvsVAvnnz5GHtBuSRwNWwbv26vRtN7pykWTTJDtZUwJ` | 0 |
| **Spot vault #2** | `HLceYQXR9kj9FAmSoZUqrd7BpopTqNA5CdXmAgUfxP4V` | 0 |
| **Insurance fund vault #0** | `oeqZSXH4j3edEF1HLEPixXUbvRDtkFn77Rr9dxo1taa` | 0 |

---

## Token Mints

| Token | Mint Address |
|-------|-------------|
| **USDC** (devnet) | `4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn` |

---

## Oracles

| Oracle | Address | Owner |
|--------|---------|-------|
| **SOL Prelaunch Oracle** | `8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG` | Drift Program |

The prelaunch oracle is updated every 10 seconds by the `float-oracle` service, pulling the live SOL/USD price from Binance.

---

## Service → Wallet Mapping

| pm2 Service | Wallet Used | Port |
|-------------|-------------|------|
| **float-frontend** | N/A (serves UI) | 5174 |
| **float-dlob** | N/A (orderbook server) | 6969 |
| **float-oracle** | Admin (`DXosop8D...`) | — |
| **float-filler** | Filler (`66w2bgBM...`) | 8888 |
| **float-liquidator** | Liquidator (`D9k5Mo7Y...`) | 8890 |

---

## How PDAs Are Derived

All PDA addresses are deterministic from the program ID `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE`:

```
State PDA           = findProgramAddress(["drift_state"], programId)
Drift Signer        = findProgramAddress(["drift_signer"], programId)
Spot market #N      = findProgramAddress(["spot_market", u16(N)], programId)
Spot vault #N       = findProgramAddress(["spot_market_vault", u16(N)], programId)
Perp market #N      = findProgramAddress(["perp_market", u16(N)], programId)
Insurance vault #N  = findProgramAddress(["insurance_fund_vault", u16(N)], programId)
```
