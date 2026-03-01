#!/bin/bash
# Deploy drift program - closes existing buffer, deploys fresh via api.devnet.solana.com
set -e

export PATH=/home/gorcore/.local/share/solana/install/active_release/bin:/home/gorcore/.cargo/bin:$PATH

KP=/home/gorcore/Drift-Clone/keys/admin-keypair.json
PROGRAM_ID=EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE
BINARY=/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so
RPC=https://api.devnet.solana.com

echo "=== Setting config ==="
solana config set --url "$RPC" --keypair "$KP"

echo ""
echo "=== Current balance ==="
solana balance

echo ""
echo "=== Closing any open buffers ==="
solana program close --buffers 2>&1 || echo "(no buffers to close)"

echo ""
echo "=== Balance after buffer close ==="
solana balance

echo ""
echo "=== Deploying program ==="
echo "Binary: $BINARY"
echo "Program: $PROGRAM_ID"
echo "RPC: $RPC"
echo ""

# Deploy with --use-rpc flag and high retry count
solana program deploy \
  --program-id "$PROGRAM_ID" \
  "$BINARY" \
  --use-rpc \
  --max-sign-attempts 200 \
  -v

echo ""
echo "=== Deploy complete ==="
solana balance
