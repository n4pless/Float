#!/bin/bash
# SAFE Drift Program Upgrade on Devnet
# Uses admin keypair as buffer authority so SOL is ALWAYS recoverable
set -e

export PATH="/root/.local/share/solana/install/active_release/bin:/root/.cargo/bin:/usr/bin:$PATH"

ADMIN_KEY="/mnt/c/Users/wesle/Documents/GitHub/Drift-Clone/keys/admin-keypair.json"
DRIFT_SO="/mnt/c/Users/wesle/Documents/GitHub/Drift-Clone/protocol-v2/target/deploy/drift.so"
DRIFT_KP="/mnt/c/Users/wesle/Documents/GitHub/Drift-Clone/protocol-v2/target/deploy/drift-keypair.json"
RPC="https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/"

ADMIN_PUB=$(solana-keygen pubkey $ADMIN_KEY)
PROGRAM_PUB=$(solana-keygen pubkey $DRIFT_KP)

echo ""
echo "========================================="
echo "  SAFE DRIFT UPGRADE ON DEVNET"
echo "========================================="
echo ""
echo "Admin:   $ADMIN_PUB"
echo "Program: $PROGRAM_PUB"
echo "Binary:  $(wc -c < $DRIFT_SO) bytes"
echo "Balance: $(solana balance $ADMIN_PUB -u $RPC)"
echo ""
echo "SAFETY: Admin keypair is buffer authority."
echo "If ANYTHING fails, recover SOL with:"
echo "  solana program close --buffers -k $ADMIN_KEY -u $RPC"
echo ""

# Check for leftover buffers
echo "--- Checking for existing buffers ---"
BUFFERS=$(solana program show --buffers -k $ADMIN_KEY -u $RPC 2>&1)
echo "$BUFFERS"
echo ""

# If there are existing buffers, close them first to recover SOL
if echo "$BUFFERS" | grep -q "Buffer"; then
    echo "Found existing buffers! Closing them to recover SOL..."
    solana program close --buffers -k $ADMIN_KEY -u $RPC
    echo "Recovered! New balance: $(solana balance $ADMIN_PUB -u $RPC)"
    echo ""
fi

echo "--- STEP 1/2: Writing buffer ---"
echo "Started: $(date '+%H:%M:%S')"
echo ""

BUFFER_OUTPUT=$(solana program write-buffer "$DRIFT_SO" \
    --keypair "$ADMIN_KEY" \
    --url "$RPC" \
    --buffer-authority "$ADMIN_KEY" \
    --with-compute-unit-price 1000 \
    --max-sign-attempts 200 \
    2>&1)

echo "$BUFFER_OUTPUT"
echo ""

BUFFER_ADDR=$(echo "$BUFFER_OUTPUT" | grep -oP '[A-HJ-NP-Za-km-z1-9]{32,}' | head -1)

if [ -z "$BUFFER_ADDR" ]; then
    echo "ERROR: Could not extract buffer address!"
    echo "Check buffers with: solana program show --buffers -k $ADMIN_KEY -u $RPC"
    exit 1
fi

echo "Buffer address: $BUFFER_ADDR"
echo "Buffer write finished: $(date '+%H:%M:%S')"
echo ""
echo "Balance after buffer: $(solana balance $ADMIN_PUB -u $RPC)"
echo ""

echo "--- STEP 2/2: Upgrading program from buffer ---"
echo ""

solana program deploy \
    --keypair "$ADMIN_KEY" \
    --url "$RPC" \
    --program-id "$DRIFT_KP" \
    --buffer "$BUFFER_ADDR" \
    --with-compute-unit-price 1000 \
    --max-sign-attempts 200 \
    2>&1

echo ""
echo "========================================="
echo "  UPGRADE COMPLETE!"
echo "========================================="
echo ""
echo "Program ID: $PROGRAM_PUB"
echo "Final balance: $(solana balance $ADMIN_PUB -u $RPC)"
echo ""
echo "Verifying..."
solana program show $PROGRAM_PUB -u $RPC
