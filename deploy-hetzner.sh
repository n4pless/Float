#!/bin/bash
########################################################################
#  Drift Clone — Hetzner Server Full Deployment Script
#  Runs: Solana test-validator + Drift Protocol + Frontend
########################################################################
set -euo pipefail

export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
source "$HOME/.cargo/env" 2>/dev/null || true

REPO="$HOME/Drift-Clone"
SERVER_IP="95.217.193.241"
DRIFT_PROGRAM_ID="EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE"
PYTH_PROGRAM_ID="FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH"
TOKEN_FAUCET_ID="V4v1mQiAdLz4qwckEb45WqHYceYizoib39cDBHSWfaB"

echo ""
echo "============================================================"
echo "  DRIFT CLONE — HETZNER SERVER DEPLOYMENT"
echo "  Server: $SERVER_IP"
echo "============================================================"
echo ""

# ── 0. Sanity checks ──────────────────────────────────────────────
echo "[1/8] Checking prerequisites..."
command -v solana >/dev/null 2>&1 || { echo "ERROR: solana not found"; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v npm    >/dev/null 2>&1 || { echo "ERROR: npm not found"; exit 1; }
echo "  solana: $(solana --version)"
echo "  node:   $(node --version)"
echo "  npm:    $(npm --version)"

# ── 1. Kill any existing processes ────────────────────────────────
echo ""
echo "[2/8] Stopping existing processes..."
pkill -f solana-test-validator 2>/dev/null && echo "  Stopped old validator" || echo "  No existing validator"
pkill -f "vite" 2>/dev/null && echo "  Stopped old frontend" || echo "  No existing frontend"
sleep 2

# ── 2. Configure Solana CLI ──────────────────────────────────────
echo ""
echo "[3/8] Configuring Solana CLI..."
solana config set --url http://localhost:8899 --keypair "$REPO/keys/admin-keypair.json" 2>/dev/null
echo "  RPC: http://localhost:8899"
echo "  Keypair: $REPO/keys/admin-keypair.json"

# ── 3. Start Solana Test Validator ───────────────────────────────
echo ""
echo "[4/8] Starting Solana test validator (listening on 0.0.0.0)..."

LEDGER="$HOME/validator-ledger"
rm -rf "$LEDGER"
mkdir -p "$LEDGER"

# Start validator with the Drift program pre-loaded, bound to all interfaces
nohup solana-test-validator \
  --ledger "$LEDGER" \
  --bpf-program "$DRIFT_PROGRAM_ID" "$REPO/protocol-v2/target/deploy/drift.so" \
  --account EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v "$REPO/protocol-v2/deps/configs/usdc.json" \
  --account 3rdJbqfnagQ4yx9HXJViD4zc4xpiSqmFsKpPuSCQVyQL "$REPO/protocol-v2/deps/configs/pyth_lazer_storage.json" \
  --bind-address 0.0.0.0 \
  --rpc-port 8899 \
  --reset \
  --quiet \
  > "$HOME/validator.log" 2>&1 &

VALIDATOR_PID=$!
echo "  Validator PID: $VALIDATOR_PID"

# Wait for validator to be ready
echo "  Waiting for validator to come online..."
for i in $(seq 1 30); do
  if solana cluster-version 2>/dev/null | grep -q '^'; then
    echo "  Validator is ready! ($(solana cluster-version))"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  ERROR: Validator failed to start. Logs:"
    tail -20 "$HOME/validator.log"
    exit 1
  fi
  sleep 1
done

# ── 4. Fund admin wallet ─────────────────────────────────────────
echo ""
echo "[5/8] Funding admin wallet..."
ADMIN_PUBKEY=$(solana-keygen pubkey "$REPO/keys/admin-keypair.json")
echo "  Admin: $ADMIN_PUBKEY"

solana airdrop 100 "$ADMIN_PUBKEY" --url http://localhost:8899 2>/dev/null || true
sleep 1
solana airdrop 100 "$ADMIN_PUBKEY" --url http://localhost:8899 2>/dev/null || true
BALANCE=$(solana balance "$ADMIN_PUBKEY" --url http://localhost:8899 2>/dev/null || echo "0 SOL")
echo "  Balance: $BALANCE"

# ── 5. Install npm dependencies ──────────────────────────────────
echo ""
echo "[6/8] Installing npm dependencies..."
cd "$REPO"
npm install --legacy-peer-deps 2>&1 | tail -3
cd "$REPO/frontend"
npm install --legacy-peer-deps 2>&1 | tail -3

# ── 6. Initialize Drift Protocol ─────────────────────────────────
echo ""
echo "[7/8] Initializing Drift Protocol..."
cd "$REPO"
node scripts/init-drift-localnet.mjs 2>&1

# ── 7. Update frontend config for localnet ───────────────────────
echo ""
echo "[8/8] Starting frontend..."

# Read the updated drift-config.json
if [ -f "$REPO/drift-config.json" ]; then
  USDC_MINT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPO/drift-config.json','utf8')).usdcMint)")
  SOL_ORACLE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPO/drift-config.json','utf8')).solOracle)")
  DRIFT_PID=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$REPO/drift-config.json','utf8')).driftProgramId)")
  
  echo "  Updating frontend config..."
  echo "    USDC Mint: $USDC_MINT"
  echo "    SOL Oracle: $SOL_ORACLE"
  echo "    Drift Program: $DRIFT_PID"

  # Update frontend config.ts
  cat > "$REPO/frontend/src/config.ts" << CFGEOF
/**
 * Drift Exchange Configuration — Hetzner Server Localnet
 */

export const DRIFT_CONFIG = {
  // Network — localnet on this server, accessed via public IP
  rpc: 'http://${SERVER_IP}:8899',
  network: 'devnet',  // SDK env hint (localnet uses devnet config internally)

  // Program IDs
  driftProgram: '${DRIFT_PID}',

  // Tokens
  usdc: {
    mint: '${USDC_MINT}',
    decimals: 6,
    symbol: 'USDC',
  },

  // Oracles
  solOracle: '${SOL_ORACLE}',

  // Markets
  markets: {
    0: { symbol: 'SOL-PERP', index: 0, pair: 'SOL/USDC' },
  },

  // Default leverage limits
  maxLeverage: 10,
  defaultLeverage: 2,

  // Fee structure
  fees: {
    makerFee: -0.0001,
    takerFee: 0.0005,
    liquidationFee: 0.025,
  },
};

export type MarketConfig = typeof DRIFT_CONFIG.markets[0];
export type Config = typeof DRIFT_CONFIG;
export default DRIFT_CONFIG;
CFGEOF
fi

# Update vite config to bind to 0.0.0.0 and also update faucet plugin
# to use localhost:8899 instead of devnet
sed -i "s|host: '127.0.0.1'|host: '0.0.0.0'|g" "$REPO/frontend/vite.config.ts"
sed -i "s|https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966|http://localhost:8899|g" "$REPO/frontend/vite.config.ts"

# Start the frontend
cd "$REPO/frontend"
echo ""
echo "  Starting Vite frontend on 0.0.0.0:5173..."
nohup npx vite --host 0.0.0.0 --port 5173 > "$HOME/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

sleep 3

echo ""
echo "============================================================"
echo "  DEPLOYMENT COMPLETE!"
echo "============================================================"
echo ""
echo "  Frontend:     http://${SERVER_IP}:5173"
echo "  Solana RPC:   http://${SERVER_IP}:8899"
echo "  WebSocket:    ws://${SERVER_IP}:8900"
echo ""
echo "  Processes:"
echo "    Validator log: tail -f ~/validator.log"
echo "    Frontend log:  tail -f ~/frontend.log"
echo ""
echo "  Stop everything:"
echo "    pkill -f solana-test-validator"
echo "    pkill -f vite"
echo ""
echo "============================================================"
