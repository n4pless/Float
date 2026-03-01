#!/bin/bash
export PATH=/home/gorcore/.local/share/solana/install/active_release/bin:/home/gorcore/.cargo/bin:$PATH

RPC="https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966"
KP=/home/gorcore/Drift-Clone/keys/admin-keypair.json
PROGRAM_ID=EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE
BINARY=/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so

echo "=== Admin balance ==="
solana balance --keypair "$KP" --url "$RPC"

echo ""
echo "=== Step 1: Write buffer ==="
# Use --max-sign-attempts to retry failed writes
solana program write-buffer "$BINARY" \
  --keypair "$KP" \
  --url "$RPC" \
  --max-sign-attempts 50 \
  --buffer /tmp/buffer-keypair.json \
  2>&1

if [ $? -ne 0 ]; then
  echo ""
  echo "Buffer write failed. Generating fresh buffer keypair and retrying..."
  solana-keygen new --no-bip39-passphrase --outfile /tmp/buffer-keypair.json --force 2>/dev/null
  
  solana program write-buffer "$BINARY" \
    --keypair "$KP" \
    --url "$RPC" \
    --max-sign-attempts 100 \
    --buffer /tmp/buffer-keypair.json \
    2>&1
fi

BUFFER_ADDR=$(solana-keygen pubkey /tmp/buffer-keypair.json 2>/dev/null)
echo "Buffer address: $BUFFER_ADDR"

echo ""
echo "=== Step 2: Set buffer authority ==="
solana program set-buffer-authority "$BUFFER_ADDR" \
  --new-buffer-authority $(solana-keygen pubkey "$KP") \
  --keypair "$KP" \
  --url "$RPC" \
  2>&1

echo ""
echo "=== Step 3: Deploy from buffer ==="
solana program deploy \
  --program-id "$PROGRAM_ID" \
  --buffer "$BUFFER_ADDR" \
  --keypair "$KP" \
  --url "$RPC" \
  2>&1

echo ""
echo "=== Final balance ==="
solana balance --keypair "$KP" --url "$RPC"
