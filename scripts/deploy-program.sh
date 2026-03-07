#!/bin/bash
export PATH=/home/gorcore/.local/share/solana/install/active_release/bin:/home/gorcore/.cargo/bin:$PATH
RPC="https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/"
KP=/home/gorcore/Drift-Clone/keys/admin-keypair.json
PROGRAM=EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE
SO=/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so

echo "=== Closing open buffers ==="
solana program close --buffers --keypair "$KP" --url "$RPC" 2>&1 || true

echo ""
echo "=== Deploying program ==="
solana program deploy --program-id "$PROGRAM" "$SO" --keypair "$KP" --url "$RPC" 2>&1
