#!/bin/bash
# Phase 1 Setup - Updated with correct paths

export PATH="/root/.local/share/solana/install/active_release/bin:/root/.cargo/bin:$PATH"

echo "🚀 Drift Clone - Phase 1 Quick Setup"
echo "======================================"
echo ""

# Navigate to project
cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone

# Configure Solana for testnet
echo "☀️  Configuring Solana for testnet..."
solana config set --url https://api.testnet.solana.com

# Show config
echo ""
echo "Solana Configuration:"
solana config get

# Create keys directory
echo ""
echo "📁 Creating keys directory..."
mkdir -p keys

# Create admin keypair
echo ""
echo "🔑 Creating admin keypair..."
if [ ! -f keys/admin-keypair.json ]; then
    echo "Please save your seed phrase in a secure location!"
    solana-keygen new --outfile keys/admin-keypair.json --no-bip39-passphrase
else
    echo "⚠️  Admin keypair already exists at keys/admin-keypair.json"
fi

# Get admin pubkey
ADMIN_PUBKEY=$(solana-keygen pubkey keys/admin-keypair.json)
echo ""
echo "✅ Admin Public Key: $ADMIN_PUBKEY"

# Request airdrops
echo ""
echo "💰 Requesting testnet SOL airdrops..."
echo "This may take a moment..."

solana airdrop 2 keys/admin-keypair.json || echo "⚠️  First airdrop attempt completed"
sleep 3
solana airdrop 2 keys/admin-keypair.json || echo "⚠️  Second airdrop attempt completed"
sleep 2

# Check balance
BALANCE=$(solana balance keys/admin-keypair.json || echo "0 SOL")
echo ""
echo "💰 Current balance: $BALANCE"

echo ""
echo "=========================================="
echo "✅ Solana configured!"
echo "=========================================="
echo ""
echo "Next: Build and deploy protocol-v2"
echo ""
echo "Commands:"
echo "  cd protocol-v2"
echo "  yarn install"
echo "  anchor build"
echo "  anchor deploy --provider.cluster testnet"
echo ""
