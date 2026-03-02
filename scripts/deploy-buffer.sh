#!/bin/bash
export PATH=/home/gorcore/.local/share/solana/install/active_release/bin:/usr/bin:/usr/sbin:/bin:$PATH

echo "Starting write-buffer at $(date)"
echo "Program binary: /home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so"
echo "Buffer keypair: /home/gorcore/buffer-keypair.json"
echo "Buffer pubkey: $(solana-keygen pubkey /home/gorcore/buffer-keypair.json)"
echo "RPC: https://api.devnet.solana.com"
echo "Payer balance: $(solana balance -k /home/gorcore/Drift-Clone/keys/admin-keypair.json --url https://api.devnet.solana.com 2>&1)"
echo "---"

solana program write-buffer \
  /home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so \
  --buffer /home/gorcore/buffer-keypair.json \
  --url https://api.devnet.solana.com \
  --max-sign-attempts 1000 \
  -k /home/gorcore/Drift-Clone/keys/admin-keypair.json \
  2>&1

WRITE_EXIT=$?
echo "---"
echo "Write-buffer exit code: $WRITE_EXIT"
echo "Finished at $(date)"

if [ $WRITE_EXIT -eq 0 ]; then
  echo "Buffer write succeeded! Now deploying..."
  BUFFER_PUBKEY=$(solana-keygen pubkey /home/gorcore/buffer-keypair.json)
  
  solana program deploy \
    --program-id EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE \
    --buffer "$BUFFER_PUBKEY" \
    --url https://api.devnet.solana.com \
    --max-sign-attempts 1000 \
    -k /home/gorcore/Drift-Clone/keys/admin-keypair.json \
    2>&1
  
  DEPLOY_EXIT=$?
  echo "Deploy exit code: $DEPLOY_EXIT"
  echo "Deploy finished at $(date)"
else
  echo "Buffer write failed. Buffer keypair saved for resume."
fi
