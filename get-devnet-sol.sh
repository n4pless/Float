#!/bin/bash
# Get devnet SOL

export PATH="/root/.local/share/solana/install/active_release/bin:/root/.cargo/bin:$PATH"

cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone

echo "💡 Switching to devnet (easier airdrops than testnet)..."
solana config set --url https://api.devnet.solana.com

echo ""
echo "💰 Requesting devnet SOL airdrops..."
solana airdrop 2 keys/admin-keypair.json
sleep 3
solana airdrop 2 keys/admin-keypair.json

echo ""
echo "💰 Current balance:"
solana balance keys/admin-keypair.json

echo ""
echo "✅ Ready to build!"
