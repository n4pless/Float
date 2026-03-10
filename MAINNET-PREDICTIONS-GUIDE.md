# Prediction Market — Mainnet Deployment Guide

> Step-by-step guide to deploy the Float Prediction Market from devnet to Solana **mainnet-beta**.
>
> **Date created:** 2026-03-10
> **Current state:** Running on devnet with program `FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Keypair Inventory](#2-keypair-inventory)
3. [Prerequisites](#3-prerequisites)
4. [Step 1 — Fund the Admin Wallet](#step-1--fund-the-admin-wallet)
5. [Step 2 — Build the Program for Mainnet](#step-2--build-the-program-for-mainnet)
6. [Step 3 — Deploy to Mainnet](#step-3--deploy-to-mainnet)
7. [Step 4 — Update Frontend for Mainnet](#step-4--update-frontend-for-mainnet)
8. [Step 5 — Update Keeper Bot for Mainnet](#step-5--update-keeper-bot-for-mainnet)
9. [Step 6 — Initialize the Game](#step-6--initialize-the-game)
10. [Step 7 — Start the Keeper Bot](#step-7--start-the-keeper-bot)
11. [Step 8 — Build & Deploy Frontend](#step-8--build--deploy-frontend)
12. [Step 9 — Reclaim Reclaimable SOL](#step-9--reclaim-reclaimable-sol)
13. [Cost Breakdown](#cost-breakdown)
14. [Rollback / Emergency](#rollback--emergency)
15. [File Reference](#file-reference)

---

## 1. Architecture Overview

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│   Frontend   │────▶│  Solana Mainnet   │◀────│  Keeper Bot    │
│  (Vite/React)│     │  Prediction Prog  │     │ (Node.js cron) │
└──────────────┘     └──────────────────┘     └────────────────┘
                            │   │
                     Game PDA   Round PDAs
                            │
                     ┌──────┴──────┐
                     │  Treasury   │  (collects fees)
                     └─────────────┘
```

**On-chain accounts:**
| Account | Seeds | Purpose |
|---------|-------|---------|
| Game PDA | `["game"]` | Global config, holds all bet SOL |
| Round PDA | `["round", epoch_le_bytes]` | Per-round state (prices, amounts) |
| UserBet PDA | `["bet", epoch_le_bytes, user_pubkey]` | Per-user bet record |

**Instruction flow:** `initialize` → `genesis_start_round` → `genesis_lock_round` → `execute_round` (loop)

---

## 2. Keypair Inventory

### Devnet (backed up)

| Key | File | Pubkey |
|-----|------|--------|
| Admin/Operator | `keys/devnet-backup/admin-keypair.json` | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |
| Program | (on-chain, deploy authority = admin) | `FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf` |

### Mainnet (newly generated)

| Key | File | Pubkey | Purpose |
|-----|------|--------|---------|
| **Admin** | `keys/mainnet/admin-keypair.json` | `7UbmcfbvxxouKThUp6Z3R5gYLF4qCmcUFDJRVjEWVusb` | Deploys program, initializes game, signs admin txs |
| **Program** | `keys/mainnet/program-keypair.json` | `HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1` | The on-chain program address |
| **Treasury** | `keys/mainnet/treasury-keypair.json` | `5GvAzur6gL9N5BwwqZRPrAbM3ydHgoGc5Zb47fWgAxDu` | Receives treasury fees from rounds |

> ⚠️ **IMPORTANT:** These keypair JSON files are in `.gitignore`. Never commit them to git.
> Back them up to a secure location (USB drive, password manager, etc.).

### Seed Phrases (save these securely, then delete from this doc)

| Key | Seed Phrase |
|-----|-------------|
| Admin | `sheriff gauge dust champion dizzy someone connect planet tell junk hire deer` |
| Program | `snack lucky poet suggest basic best fee egg wild joy become include` |
| Treasury | `one crop refuse orient face load enemy morning phrase habit speed worry` |

> 🔐 **After saving these seed phrases securely, delete the table above from this file.**

---

## 3. Prerequisites

On the **Hetzner server** (`gorcore@95.217.193.241`):

```bash
# These are already installed:
# Solana CLI 1.18.26  → /home/gorcore/.local/share/solana/install/active_release/bin/
# Anchor CLI 0.29.0   → /home/gorcore/.cargo/bin/anchor
# Rust/Cargo           → /home/gorcore/.cargo/bin/
# Node.js              → managed via nvm

# Add to PATH (or add to ~/.bashrc):
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"

# Verify:
solana --version       # 1.18.26
anchor --version       # 0.29.0
rustc --version        # 1.7x+
node --version         # 18+
```

You'll also need a **mainnet RPC** endpoint. Options:
- Free: `https://api.mainnet-beta.solana.com` (rate-limited)
- QuikNode, Helius, Triton — recommended for production
- Set it as `MAINNET_RPC` in the commands below

---

## Step 1 — Fund the Admin Wallet

The admin wallet needs **~4 SOL** to cover:
- Program deployment rent: ~2.1 SOL (for 295KB program)
- Transaction fees: ~0.01 SOL
- Game initialization rent: ~0.003 SOL
- Buffer for first few rounds: ~0.05 SOL
- Remaining stays as operating balance

**Send 4 SOL to:** `7UbmcfbvxxouKThUp6Z3R5gYLF4qCmcUFDJRVjEWVusb`

Verify the balance:
```bash
solana balance 7UbmcfbvxxouKThUp6Z3R5gYLF4qCmcUFDJRVjEWVusb --url mainnet-beta
```

---

## Step 2 — Build the Program for Mainnet

SSH into the server:
```bash
ssh -i gorcore_gorpc_ssh gorcore@95.217.193.241
```

Update the program ID to the new mainnet keypair:

### 2a. Update `declare_id!` in lib.rs
```bash
cd ~/Drift-Clone/prediction-market

# The new program ID is:
# HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1

# Edit the program source:
sed -i 's/FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf/HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1/' programs/prediction/src/lib.rs
```

### 2b. Update Anchor.toml for mainnet
```bash
cat > Anchor.toml << 'EOF'
[provider]
cluster = "mainnet"
wallet = "/home/gorcore/Drift-Clone/keys/mainnet/admin-keypair.json"

[programs.mainnet]
prediction = "HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1"

[programs.devnet]
prediction = "FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf"
EOF
```

### 2c. Build
```bash
# Set Solana CLI to mainnet
solana config set --url mainnet-beta
solana config set --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json

# Build the program
anchor build

# Verify the built program keypair matches:
solana-keygen pubkey target/deploy/prediction-keypair.json
# If it doesn't match, copy our keypair:
cp ~/Drift-Clone/keys/mainnet/program-keypair.json target/deploy/prediction-keypair.json
anchor build  # rebuild to embed correct ID
```

The output will be at `target/deploy/prediction.so` (~296KB).

---

## Step 3 — Deploy to Mainnet

```bash
cd ~/Drift-Clone/prediction-market

# Deploy using the admin wallet as payer and program keypair for the address
solana program deploy \
  target/deploy/prediction.so \
  --program-id ~/Drift-Clone/keys/mainnet/program-keypair.json \
  --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json \
  --url mainnet-beta \
  --with-compute-unit-price 50000 \
  --max-sign-attempts 5

# Expected output:
# Program Id: HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1
# Signature: ...
```

> **Cost:** ~2.06 SOL for rent (refundable if you close the program later)

### Verify deployment
```bash
solana program show HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1 --url mainnet-beta
```

Expected output:
```
Program Id: HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1
Owner: BPFLoaderUpgradeab1e11111111111111111111111
Authority: 7UbmcfbvxxouKThUp6Z3R5gYLF4qCmcUFDJRVjEWVusb
Data Length: 295808 bytes
Balance: ~2.06 SOL
```

---

## Step 4 — Update Frontend for Mainnet

On your **local machine**, edit the following files:

### 4a. `frontend/src/prediction/client.ts`
Change the program ID:
```typescript
// Line ~18
export const PREDICTION_PROGRAM_ID = new PublicKey('HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1');
```

### 4b. `frontend/src/config.ts`
Add mainnet RPC endpoint:
```typescript
// Replace devnet endpoints with mainnet:
export const RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
// Or use a dedicated RPC:
// export const RPC_ENDPOINT = 'https://your-quicknode-or-helius-mainnet-url';
```

### 4c. `frontend/src/utils/rpc.ts`
Update the fallback RPC URLs to mainnet endpoints.

### 4d. Wallet adapter network
In the wallet provider setup (likely `App.tsx` or a provider component), ensure the network is set to `mainnet-beta`:
```typescript
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
const network = WalletAdapterNetwork.Mainnet;
```

> **TIP:** You can use environment variables to toggle between devnet and mainnet,
> or keep both configs and switch via a `VITE_NETWORK=mainnet` env var.

---

## Step 5 — Update Keeper Bot for Mainnet

### 5a. `scripts/prediction-keeper.mjs`
Update the program ID (line ~30):
```javascript
const PROGRAM_ID = new PublicKey('HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1');
```

### 5b. Run with mainnet config
```bash
# On the Hetzner server:
export RPC_URL="https://api.mainnet-beta.solana.com"   # or your paid RPC
export KEEPER_KEY="/home/gorcore/Drift-Clone/keys/mainnet/admin-keypair.json"
export INTERVAL=300          # 5 min rounds
export MIN_BET=10000000      # 0.01 SOL minimum on mainnet (10x devnet)
export TREASURY_FEE=300      # 3%

node scripts/prediction-keeper.mjs
```

---

## Step 6 — Initialize the Game

The keeper bot auto-initializes on first run. But if you want to do it manually:

```bash
# The keeper handles: initialize → genesis_start_round → genesis_lock_round
# Just run it and it will set up everything:
RPC_URL="https://api.mainnet-beta.solana.com" \
KEEPER_KEY="/home/gorcore/Drift-Clone/keys/mainnet/admin-keypair.json" \
INTERVAL=300 \
MIN_BET=10000000 \
TREASURY_FEE=300 \
node scripts/prediction-keeper.mjs
```

The bot will:
1. Create the Game PDA (one-time)
2. Start genesis round (round #1)
3. After `INTERVAL` seconds, lock genesis and start round #2
4. Continue in a loop

---

## Step 7 — Start the Keeper Bot

Use PM2 for production:

```bash
cd ~/Drift-Clone

# Create a mainnet ecosystem config:
cat > ecosystem.mainnet.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'prediction-keeper-mainnet',
    script: 'scripts/prediction-keeper.mjs',
    env: {
      RPC_URL: 'https://api.mainnet-beta.solana.com',
      KEEPER_KEY: '/home/gorcore/Drift-Clone/keys/mainnet/admin-keypair.json',
      INTERVAL: '300',
      MIN_BET: '10000000',
      TREASURY_FEE: '300',
    },
    restart_delay: 5000,
    max_restarts: 100,
    autorestart: true,
  }]
};
EOF

# Start it:
pm2 start ecosystem.mainnet.config.js
pm2 save

# Monitor:
pm2 logs prediction-keeper-mainnet --lines 50
```

> **Keep the devnet keeper running separately** — it uses the existing config/keypair.

---

## Step 8 — Build & Deploy Frontend

```bash
# On local machine:
cd frontend
npm run build

# Push to GitHub:
cd ..
git add -A
git commit -m "feat: mainnet prediction deployment"
git push origin main

# Deploy on server:
ssh gorcore@95.217.193.241
cd ~/Drift-Clone && git pull origin main
cd frontend && npm run build
sudo systemctl reload nginx
```

---

## Step 9 — Reclaim Reclaimable SOL

### Program buffer accounts
After deployment, there may be leftover buffer accounts from the deploy process. These hold rent SOL that can be reclaimed:

```bash
# List all buffer accounts owned by your admin wallet:
solana program show --buffers \
  --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json \
  --url mainnet-beta

# Close each buffer to reclaim rent:
solana program close <BUFFER_ADDRESS> \
  --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json \
  --url mainnet-beta
```

### Reclaim program deploy rent (only if shutting down)
If you ever want to **close the program entirely** and reclaim the ~2.06 SOL rent:
```bash
# ⚠️ WARNING: This permanently destroys the program. Only do this if shutting down.
solana program close HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1 \
  --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json \
  --url mainnet-beta
```

### Treasury collection
The treasury keypair (`5GvAzur6gL9N5BwwqZRPrAbM3ydHgoGc5Zb47fWgAxDu`) will accumulate 3% fees from every round. Transfer earnings:
```bash
solana transfer <YOUR_MAIN_WALLET> ALL \
  --keypair ~/Drift-Clone/keys/mainnet/treasury-keypair.json \
  --url mainnet-beta \
  --allow-unfunded-recipient
```

---

## Cost Breakdown

| Item | SOL | Refundable? |
|------|-----|-------------|
| Program deployment rent (~296KB) | ~2.06 | ✅ Yes (close program) |
| Game PDA rent (133 bytes) | ~0.002 | ✅ Yes (if closed) |
| Each Round PDA rent (~125 bytes) | ~0.001 | ❌ No (accumulates) |
| Transaction fees (deploy) | ~0.01 | ❌ No |
| Transaction fees (per round) | ~0.000005 | ❌ No |
| **Total initial cost** | **~2.07** | |
| **Recommended funding** | **4.00** | (leaves ~1.93 operating balance) |

---

## Rollback / Emergency

### Pause the game
```bash
# Use the admin keypair to pause:
# (You'll need a small script or add a pause command to the keeper)
# The program has pause/unpause instructions
```

### Revert frontend to devnet
Change `PREDICTION_PROGRAM_ID` back to `FWaSUVUSBk7MoYbWL8DLWkbfLHgbMcmGfYLgVQ5foaLf` and RPC endpoints back to devnet. Rebuild and deploy.

### Upgrade the program
Since the admin is the upgrade authority, you can upgrade the deployed program:
```bash
solana program deploy \
  target/deploy/prediction.so \
  --program-id HY9KdbKrtNx4J24qtXd2NGqp3quE7ZEbUoegq6A9b6r1 \
  --keypair ~/Drift-Clone/keys/mainnet/admin-keypair.json \
  --url mainnet-beta \
  --upgrade-authority ~/Drift-Clone/keys/mainnet/admin-keypair.json
```

---

## File Reference

| File | What to change for mainnet |
|------|---------------------------|
| `prediction-market/programs/prediction/src/lib.rs` | `declare_id!` → new program ID |
| `prediction-market/Anchor.toml` | Add `[programs.mainnet]` section, update wallet path |
| `frontend/src/prediction/client.ts` | `PREDICTION_PROGRAM_ID` → new program ID |
| `frontend/src/config.ts` | RPC endpoint → mainnet |
| `frontend/src/utils/rpc.ts` | Fallback RPC → mainnet |
| `scripts/prediction-keeper.mjs` | `PROGRAM_ID` → new program ID (or use env vars) |
| `keys/mainnet/admin-keypair.json` | Deploy authority + operator (fund with 4 SOL) |
| `keys/mainnet/program-keypair.json` | Program address on mainnet |
| `keys/mainnet/treasury-keypair.json` | Fee collection wallet |

---

## Quick-Start Checklist

- [ ] Back up devnet keypairs ✅ (done → `keys/devnet-backup/`)
- [ ] Generate mainnet keypairs ✅ (done → `keys/mainnet/`)
- [ ] Save seed phrases securely
- [ ] Fund admin wallet with 4 SOL → `7UbmcfbvxxouKThUp6Z3R5gYLF4qCmcUFDJRVjEWVusb`
- [ ] Update `declare_id!` in lib.rs
- [ ] Update Anchor.toml
- [ ] Build program (`anchor build`)
- [ ] Deploy program to mainnet
- [ ] Close any leftover buffer accounts
- [ ] Update frontend program ID + RPC
- [ ] Update keeper bot program ID + RPC
- [ ] Start keeper bot via PM2
- [ ] Build and deploy frontend
- [ ] Verify everything works on mainnet
- [ ] Delete seed phrases from this document
