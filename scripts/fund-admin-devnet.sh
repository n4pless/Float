#!/bin/bash
# Fund admin wallet on devnet via repeated airdrops
PATH=/root/.local/share/solana/install/active_release/bin:/usr/bin
TARGET="DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G"
RPC="https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/"

echo "Funding $TARGET on devnet..."
echo "Current balance:"
solana balance "$TARGET" --url "$RPC"

for i in $(seq 1 25); do
  echo ""
  echo "=== Airdrop #$i of 25 ==="
  solana airdrop 2 "$TARGET" --url "$RPC" 2>&1 || echo "  (failed, will retry)"
  sleep 12
done

echo ""
echo "=== Final balance ==="
solana balance "$TARGET" --url "$RPC"
