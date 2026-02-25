# 🤖 Phase 3: Keeper Bots & Going Live

## Overview

Keeper bots are essential autonomous systems that keep your Drift exchange running 24/7. They:
- **Liquidate** risky positions
- **Fill** orders from the orderbook
- **Execute** conditional orders
- **Earn** fees for these services

---

## Bot Types

### 1. **Liquidator Bot** 💥
Monitors positions and liquidates when they fall below maintenance margin.

**Earnings:**
- 2-5% of liquidation amount
- Example: $50k liquidation = $1,000-2,500
- Scales with trading volume

**Setup Cost:**
- ~0.05 SOL per liquidation ($1-2)
- 24/7 operation: $5-10/day

### 2. **Filler Bot** 📊
Matches orders and fills positions, earning taker fees.

**Earnings:**
- 20-50% of taker fees (normally 0.05%)
- High-volume markets: $500-2000/day
- Better in volatile markets

### 3. **Trigger Bot** 🎯
Executes conditional orders (stop losses, take profits).

**Earnings:**
- Smaller fees but less competition
- More passive income
- Good complement to other bots

---

## Quick Start

### Step 1: Generate Bot Keypair

```powershell
docker run --rm drift-dev bash -c "solana-keygen new --no-bip39-passphrase -o /dev/stdout | jq '.'" > bot-keypair.txt
```

Save this keypair securely in `keys/bot-keypair.json`

### Step 2: Fund Bot Wallet

```powershell
# Localnet (unlimited)
docker run --rm --network container:drift-validator -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys drift-dev bash -c "solana airdrop 10 BOT_PUBLIC_KEY --url http://localhost:8899"

# Devnet (limited)
# Use web faucet: https://faucet.solana.com/
```

### Step 3: Configure Bots

Create `.env` in `keeper-bots-v2/`:

```bash
# Network
RPC_URL=http://localhost:8899
WEBSOCKET_URL=ws://localhost:8900

# Program
DRIFT_PROGRAM_ID=EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE

# Keys (path to keypair JSON)
PAYER_KEY_PATH=../keys/bot-keypair.json

# Environment
DRIFT_ENV=localnet
NETWORK=localnet

# Bot specific
MIN_LIQUIDATION_USD_VALUE=100
LIQUIDATION_BATCH_SIZE=10
POLLING_INTERVAL=2000
```

### Step 4: Start Keeper Bots

**Terminal 1 - Liquidator:**
```bash
cd keeper-bots-v2
npm install
npm run liquidator
```

**Terminal 2 - Filler:**
```bash
cd keeper-bots-v2
npm run filler
```

**Terminal 3 - Trigger (Optional):**
```bash
cd keeper-bots-v2
npm run trigger
```

---

## Monitoring

### Key Metrics

Track these in your logs:

**Liquidator:**
- Liquidations per hour
- Total fees earned
- Success rate

**Filler:**
- Orders filled per hour
- Average profit per fill
- Market maker contribution

### Sample Monitoring Script

```typescript
// monitor-bots.ts
import { DriftClient } from '@drift-labs/sdk';

setInterval(async () => {
  const stats = await driftClient.getBotStats();
  console.log(`
    Liquidations: ${stats.liquidationCount}
    Fills: ${stats.fillCount}
    Earnings: ${stats.totalEarnings} SOL
    Costs: ${stats.totalCosts} SOL
    Net: ${stats.netProfit} SOL
  `);
}, 60000); // Every minute
```

---

## Economics Example

### Scenario: $100k Daily Volume

**Liquidator Bot:**
- 1-2 liquidations per day
- Average size: $20k
- Fees: 2.5% = $500-1000/day
- Costs: $10/day
- **Profit: $490-990/day** ✅

**Filler Bot:**
- 200+ fills per day
- Taker fees: $50 (0.05% of $100k)
- Earns 30%: $15/day
- Costs: $5/day
- **Profit: $10/day** ✅

**Total Daily Profit: ~$250-1000**

---

## Risk Management

### Best Practices

1. **Start on localnet**
   - Test bot logic
   - Simulate trading
   - No real money risk

2. **Use separate wallet**
   - Don't use admin wallet
   - Keep keys secure
   - Fund gradually

3. **Monitor health**
   - Check logs daily
   - Alert on failures
   - Keep sufficient SOL

4. **Scale gradually**
   - Start with 1 SOL
   - If profitable, increase funding
   - Document everything

5. **Have exit plan**
   - Save bot code
   - Document config
   - Can stop anytime

---

## Deployment Checklist

- [ ] Validator running: `docker logs drift-validator --tail 5`
- [ ] Drift deployed: `npm run status`
- [ ] Bot keypair created: `keys/bot-keypair.json`
- [ ] Bot funded with SOL
- [ ] `.env` configured in `keeper-bots-v2/`
- [ ] Dependencies installed: `npm install`
- [ ] Liquidator bot started: `npm run liquidator`
- [ ] Filler bot started: `npm run filler` (terminal 2)
- [ ] Logs showing activity
- [ ] Fees being earned

---

## Troubleshooting

### Bots not connecting to validator

```bash
# Check validator is running
docker logs drift-validator --tail 10

# Restart validator
docker restart drift-validator

# Wait 10 seconds then restart bot
sleep 10
npm run liquidator
```

### Insufficient balance

```bash
# Check bot balance
solana balance --keypair keys/bot-keypair.json --url http://localhost:8899

# Airdrop more
solana airdrop 10 BOT_PUBKEY --url http://localhost:8899
```

### Transactions failing

```bash
# Check RPC connectivity
curl http://localhost:8899 -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getClusterNodes"}'

# If error, restart validator
docker restart drift-validator
```

---

## Next: Go Live on Devnet

Once tested on localnet:

1. Deploy Drift to devnet
2. Deploy bots to devnet
3. Real trading volume
4. Real earnings (with testnet SOL)
5. Then move to mainnet!

---

## Commands Reference

```bash
# Check bot status
solana balance --keypair keys/bot-keypair.json

# View recent liquidations
grep "liquidation" keeper-bots-v2/logs/*.log | tail -20

# View fills
grep "fill" keeper-bots-v2/logs/*.log | tail -20

# Restart all bots
pkill -f "npm run"  # Kill all node processes
npm run liquidator  # Restart

# Check program state
solana program show EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE --url http://localhost:8899
```

---

## What's Next

1. **Deploy bots** (this phase)
2. **Monitor earnings** (daily)
3. **Scale on devnet** (next week)
4. **Go mainnet** (when ready)
5. **Compete with other keepers** (earn real money!)

---

You're almost there! 🚀 Get those bots running!
