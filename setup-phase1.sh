#!/bin/bash
# Phase 1 Setup Script - Drift Clone Perps Exchange

echo "🚀 Starting Phase 1 Setup for Drift Clone"
echo "=========================================="

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p scripts
mkdir -p docs
mkdir -p config
mkdir -p keys

# Clone repositories
echo "📦 Cloning Drift repositories..."
git clone https://github.com/drift-labs/protocol-v2
git clone https://github.com/drift-labs/dlob-server
git clone https://github.com/drift-labs/keeper-bots-v2
git clone https://github.com/drift-labs/drift-common

echo "✅ Repositories cloned successfully!"
echo ""
echo "Next Steps:"
echo "1. Install Solana CLI: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
echo "2. Install Anchor: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
echo "3. Configure Solana for testnet: solana config set --url https://api.testnet.solana.com"
echo "4. Create admin keypair: solana-keygen new --outfile keys/admin-keypair.json"
echo "5. Request airdrop: solana airdrop 5"
echo ""
echo "Then proceed to protocol-v2 directory to build and deploy!"
