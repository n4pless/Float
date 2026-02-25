# 🚀 Quick Start Guide - Drift Clone Perps Exchange

## You're Here: Phase 1 - Foundation & Protocol Deployment

### What You'll Build in Phase 1
By the end of Phase 1, you'll have:
- ✅ A fully deployed Drift protocol on Solana Testnet
- ✅ A SOL-PERP perpetual futures market
- ✅ A USDC spot market for collateral
- ✅ Working oracle price feeds
- ✅ Tested trading functionality

---

## 🏁 Start Here (Step-by-Step)

### Step 1: Run the Setup Script (5 minutes)
```powershell
# In PowerShell (Windows)
.\setup-phase1.ps1
```

This will:
- Create necessary folders
- Clone all 4 Drift repositories
- Give you a clear next steps list

### Step 2: Install Prerequisites (30-60 minutes)
Follow the checklist in `PHASE1-CHECKLIST.md` section "Prerequisites Installation"

**Required tools:**
1. Node.js v18+
2. Rust & Cargo
3. Solana CLI
4. Anchor CLI v0.29+

**Quick verification:**
```bash
node --version    # Should show v18+
rustc --version   # Should show recent version
solana --version  # Should show v1.17+
anchor --version  # Should show v0.29+
```

### Step 3: Configure Solana (5 minutes)
```bash
# Set network to testnet
solana config set --url https://api.testnet.solana.com

# Create your admin wallet
solana-keygen new --outfile keys/admin-keypair.json

# Get free testnet SOL (run multiple times if needed)
solana airdrop 2 keys/admin-keypair.json
solana airdrop 2 keys/admin-keypair.json

# Check you have at least 4 SOL
solana balance keys/admin-keypair.json
```

### Step 4: Build & Deploy Protocol (20-30 minutes)
```bash
# Navigate to the protocol
cd protocol-v2

# Install dependencies
yarn install

# Build (this takes time - grab coffee ☕)
anchor build

# Deploy to testnet (costs ~2-4 SOL)
anchor deploy --provider.cluster testnet
```

**Save these outputs:**
- Program ID: `________________`
- Deployment tx: `________________`

### Step 5: Initialize Markets (30-60 minutes)

This is where you create your trading markets. You'll need to:

1. **Initialize the protocol state** (clearing house)
2. **Create USDC spot market** (for collateral)
3. **Create SOL-PERP market** (the perpetual futures)

The Drift protocol-v2 repo has scripts for this. Look in:
- `tests/` folder for examples
- `sdk/src` for SDK functions
- Check the Drift documentation

**You'll need to write/adapt scripts to:**
```typescript
// Example initialization flow (pseudo-code)
// 1. Initialize State
await driftClient.initialize(adminAuthority);

// 2. Initialize USDC Spot Market
await driftClient.initializeSpotMarket({
  mint: USDC_MINT_ADDRESS,
  optimalUtilization: 8000, // 80%
  // ... other parameters
});

// 3. Initialize SOL-PERP Market
await driftClient.initializePerpMarket({
  oracle: PYTH_SOL_USD_ORACLE,
  baseAssetAmountStepSize: 10000000, // 0.01 SOL
  // ... other parameters
});
```

### Step 6: Test Everything (15-30 minutes)

Create a test script to verify your deployment:

```typescript
// Test flow
1. Create user account
2. Deposit USDC
3. Open SOL-PERP long position
4. Close position
5. Withdraw USDC
```

If all these work ✅, **Phase 1 is complete!**

---

## 📋 Detailed Checklist

For the complete step-by-step checklist, see: [PHASE1-CHECKLIST.md](PHASE1-CHECKLIST.md)

---

## ⏱️ Time Estimates

| Task | Time | Difficulty |
|------|------|------------|
| Setup & Prerequisites | 1-2 hours | Easy |
| Build & Deploy Protocol | 30-60 min | Medium |
| Initialize Markets | 1-3 hours | Hard |
| Testing | 30-60 min | Medium |
| **Total** | **3-6 hours** | **Medium** |

**Note:** Times vary based on experience. First time might take longer!

---

## 🆘 Getting Stuck?

### Common Issues & Solutions

**"Command not found" errors:**
- Make sure all tools are installed and in your PATH
- Restart your terminal after installing tools

**"Insufficient funds" errors:**
- Get more testnet SOL: `solana airdrop 2`
- If airdrops fail, try devnet or use faucet.solana.com

**Build errors:**
- Make sure Anchor version is correct: `anchor --version`
- Try: `anchor clean && anchor build`
- Update Rust: `rustup update`

**Deploy errors:**
- Check you have 4+ SOL
- Verify you're on testnet: `solana config get`
- Check RPC endpoint is responding

**Market initialization errors:**
- Study the Drift protocol tests carefully
- Check the SDK documentation
- The Drift Discord/GitHub may have examples

### Resources
- [Drift Protocol Docs](https://docs.drift.trade/)
- [Drift GitHub](https://github.com/drift-labs)
- [Anchor Book](https://book.anchor-lang.com/)
- [Solana Cookbook](https://solanacookbook.com/)

---

## ✅ Phase 1 Success Criteria

You're ready for Phase 2 when you can:
- [ ] See your deployed program on Solana Explorer (testnet)
- [ ] See USDC spot market account created
- [ ] See SOL-PERP market account created
- [ ] Successfully deposit USDC
- [ ] Successfully open a SOL-PERP position
- [ ] Successfully close the position
- [ ] Successfully withdraw USDC

---

## 🎯 What's Next?

**Phase 2:** DLOB Server & Keeper Bots
- Set up the decentralized order book
- Deploy automated bots (filler, liquidator, funding)
- Make your exchange fully automated

**Phase 3:** Production Readiness
- Comprehensive testing
- Optional UI
- Documentation
- Launch preparation

---

## 💡 Pro Tips

1. **Keep Transaction IDs**: Save all deployment and initialization transaction IDs
2. **Document Everything**: Create a `deployment-notes.md` with all your addresses
3. **Test on Devnet First**: If testnet gives you trouble, devnet might be easier
4. **Use Multiple RPC Endpoints**: If one is slow, try another
5. **Join Communities**: Drift and Solana Discord/Telegram are helpful

---

**Ready to begin?** Run `.\setup-phase1.ps1` and let's build! 🚀
