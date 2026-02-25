# Phase 1: Foundation & Protocol Deployment - Detailed Checklist

## Prerequisites Installation

### 1. Install Node.js
- [ ] Download and install Node.js v18+ from https://nodejs.org/
- [ ] Verify: `node --version`
- [ ] Verify: `npm --version`

### 2. Install Rust & Cargo
- [ ] Install from https://rustup.rs/
- [ ] Run: `rustup default stable`
- [ ] Verify: `rustc --version`
- [ ] Verify: `cargo --version`

### 3. Install Solana CLI
- [ ] Windows: Download from https://github.com/solana-labs/solana/releases
- [ ] Or use WSL/Linux: `sh -c "$(curl -sSfL https://release.solana.com/stable/install)"`
- [ ] Add to PATH
- [ ] Verify: `solana --version`

### 4. Install Anchor CLI
- [ ] Install AVM: `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force`
- [ ] Install Anchor: `avm install latest`
- [ ] Use latest: `avm use latest`
- [ ] Verify: `anchor --version`

### 5. Install Yarn (optional but recommended)
- [ ] Run: `npm install -g yarn`
- [ ] Verify: `yarn --version`

---

## Step 1: Environment Setup

### 1.1 Clone Repositories
```powershell
# Run the setup script
.\setup-phase1.ps1
```
- [ ] protocol-v2 cloned
- [ ] dlob-server cloned
- [ ] keeper-bots-v2 cloned
- [ ] drift-common cloned

### 1.2 Configure Solana CLI
```bash
# Set to testnet
solana config set --url https://api.testnet.solana.com

# Verify configuration
solana config get
```
- [ ] Cluster set to testnet
- [ ] Config verified

### 1.3 Create Admin Keypair
```bash
# Create admin keypair
solana-keygen new --outfile keys/admin-keypair.json

# Save the seed phrase in a secure location!

# Get public key
solana-keygen pubkey keys/admin-keypair.json
```
- [ ] Admin keypair created
- [ ] Seed phrase saved securely
- [ ] Public key noted

### 1.4 Fund Admin Wallet
```bash
# Request airdrop (may need to run multiple times)
solana airdrop 2 keys/admin-keypair.json

# Check balance
solana balance keys/admin-keypair.json
```
- [ ] Airdrop received (at least 2 SOL)
- [ ] Balance verified

---

## Step 2: Build & Deploy Protocol

### 2.1 Navigate to Protocol Directory
```bash
cd protocol-v2
```
- [ ] In protocol-v2 directory

### 2.2 Install Dependencies
```bash
yarn install
```
- [ ] Dependencies installed
- [ ] No errors

### 2.3 Build the Protocol
```bash
# This will take several minutes
anchor build
```
- [ ] Build successful
- [ ] .so file created in target/deploy/

### 2.4 Get Program ID
```bash
# Display the program ID
anchor keys list
```
- [ ] Program ID displayed
- [ ] Program ID saved for later: ________________________

### 2.5 Update Program IDs
- [ ] Update `Anchor.toml` with the program ID if needed
- [ ] Update `lib.rs` declare_id! if needed
- [ ] Rebuild if changes made: `anchor build`

### 2.6 Deploy to Testnet
```bash
# Deploy (this will cost ~2-4 SOL)
anchor deploy --provider.cluster testnet --provider.wallet ../keys/admin-keypair.json

# Or if configured in Anchor.toml:
anchor deploy
```
- [ ] Deployment successful
- [ ] Program ID confirmed on Solana Explorer
- [ ] Transaction signature saved: ________________________

---

## Step 3: Initialize Protocol State

### 3.1 Update Local Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Update `DRIFT_PROGRAM_ID` in `.env`
- [ ] Update `ADMIN_KEYPAIR_PATH` in `.env`

### 3.2 Initialize Clearing House
```bash
# Look for existing initialization scripts in protocol-v2
cd sdk
yarn install

# Check for init scripts in package.json or scripts folder
# Run initialization (command depends on repo structure)
```
- [ ] Clearing house state initialized
- [ ] Admin authority set
- [ ] State account created

### 3.3 Verify Initialization
- [ ] Check state account on Solana Explorer
- [ ] Verify admin authority is correct
- [ ] No errors in transaction

---

## Step 4: Create USDC Spot Market

### 4.1 Get USDC Mint
Option A - Use Testnet USDC:
- [ ] Mint: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

Option B - Create Custom USDC:
```bash
# Create token
spl-token create-token --decimals 6

# Create account
spl-token create-account <MINT_ADDRESS>

# Mint tokens to yourself
spl-token mint <MINT_ADDRESS> 1000000
```
- [ ] USDC mint address obtained: ________________________

### 4.2 Initialize USDC Spot Market
```bash
# Use SDK or CLI to initialize spot market
# This will create a spot market for USDC
```
Parameters to set:
- [ ] Asset Symbol: USDC
- [ ] Decimals: 6
- [ ] Optimal Utilization: 80%
- [ ] Initial Asset Weight: 100%
- [ ] Maintenance Asset Weight: 100%
- [ ] IMF Factor: 0

- [ ] Spot market initialized
- [ ] Market index noted: ________________________
- [ ] Verified on explorer

---

## Step 5: Create SOL-PERP Market

### 5.1 Get Pyth SOL/USD Oracle
- [ ] Testnet Oracle: `J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix`
- [ ] Verified oracle is active on Pyth

### 5.2 Initialize SOL-PERP Market
```bash
# Use SDK to initialize perp market
```
Parameters to set:
- [ ] Symbol: SOL-PERP
- [ ] Oracle: Pyth SOL/USD
- [ ] Base Asset Amount Step: 0.01 SOL (100000 in base units)
- [ ] Tick Size: $0.0001
- [ ] Minimum Order Size: 0.01 SOL
- [ ] Initial Margin Ratio: 10% (1000 bps)
- [ ] Maintenance Margin Ratio: 5% (500 bps)
- [ ] Fee Structure:
  - Maker Fee: 0.02% (2 bps)
  - Taker Fee: 0.05% (5 bps)
- [ ] Contract Tier: Speculative
- [ ] Max Leverage: 10x

- [ ] Perp market initialized
- [ ] Market index noted: ________________________
- [ ] Verified on explorer

---

## Step 6: Testing Basic Operations

### 6.1 Create Test User
```bash
# Create test user keypair
solana-keygen new --outfile keys/test-user.json

# Airdrop SOL
solana airdrop 2 keys/test-user.json
```
- [ ] Test user created
- [ ] SOL airdropped

### 6.2 Initialize User Account
```bash
# Use SDK to initialize user account in Drift
```
- [ ] User account initialized
- [ ] User PDA created

### 6.3 Test USDC Deposit
```bash
# Mint USDC to test user
spl-token mint <USDC_MINT> 10000 <TEST_USER_TOKEN_ACCOUNT>

# Deposit USDC to Drift
# Use SDK deposit function
```
- [ ] USDC minted to user
- [ ] USDC deposited successfully
- [ ] Balance verified in user account

### 6.4 Test Open SOL-PERP Position
```bash
# Use SDK to open a long position
# Example: 1 SOL-PERP long at market price
```
- [ ] Position opened successfully
- [ ] Position size correct
- [ ] Collateral locked
- [ ] Verified on explorer

### 6.5 Test Close Position
```bash
# Close the position
```
- [ ] Position closed
- [ ] PnL calculated correctly
- [ ] Collateral released

### 6.6 Test Withdrawal
```bash
# Withdraw USDC back to wallet
```
- [ ] Withdrawal successful
- [ ] Balance updated correctly

---

## Step 7: Documentation & Verification

### 7.1 Document Deployment
Create `docs/phase1-deployment.md` with:
- [ ] Program ID
- [ ] USDC mint address
- [ ] SOL-PERP market index
- [ ] USDC spot market index
- [ ] Admin public key
- [ ] Deployment transaction signatures
- [ ] Test results

### 7.2 Verify All Components
- [ ] Protocol deployed and accessible
- [ ] USDC spot market active
- [ ] SOL-PERP market active
- [ ] Oracle feeding prices
- [ ] User operations working
- [ ] No errors in logs

### 7.3 Create Monitoring Script
- [ ] Script to check market state
- [ ] Script to check oracle prices
- [ ] Script to check user positions

---

## 🎉 Phase 1 Complete!

Once all checkboxes are marked, you have:
- ✅ Deployed the Drift protocol to testnet
- ✅ Initialized USDC spot market
- ✅ Initialized SOL-PERP market
- ✅ Integrated Pyth oracles
- ✅ Tested basic user operations

**Next**: Proceed to Phase 2 (DLOB Server & Keeper Bots)

---

## Troubleshooting

### Common Issues

**Airdrop fails:**
- Try different testnet: `https://api.devnet.solana.com`
- Use faucet: https://faucet.solana.com/

**Build fails:**
- Check Anchor version: `anchor --version` (should be 0.29+)
- Clean build: `anchor clean && anchor build`
- Update Rust: `rustup update`

**Deploy fails:**
- Check SOL balance (need ~4 SOL)
- Verify network: `solana config get`
- Try with explicit args: `anchor deploy --provider.cluster testnet`

**Market initialization fails:**
- Verify program ID is correct
- Check admin has authority
- Ensure sufficient SOL for rent

---

**Need Help?** Check the main README.md for resources and documentation links.
