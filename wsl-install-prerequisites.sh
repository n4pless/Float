#!/bin/bash
# WSL2 Prerequisites Installation Script for Drift Clone
# Run this script inside your WSL Ubuntu terminal

set -e  # Exit on error

echo "🚀 Installing Prerequisites for Drift Clone in WSL2"
echo "===================================================="
echo ""

# Update system
echo "📦 Updating Ubuntu packages..."
sudo apt update && sudo apt upgrade -y

# Install essential build tools
echo ""
echo "🔧 Installing build tools..."
sudo apt install -y curl wget git build-essential pkg-config libssl-dev libudev-dev

# Install Node.js 20.x
echo ""
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

echo "✅ Node.js installed: $(node --version)"
echo "✅ NPM installed: $(npm --version)"

# Install Yarn
echo ""
echo "📦 Installing Yarn..."
sudo npm install -g yarn
echo "✅ Yarn installed: $(yarn --version)"

# Install Rust
echo ""
echo "🦀 Installing Rust..."
if ! command -v rustc &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "✅ Rust installed: $(rustc --version)"
else
    echo "✅ Rust already installed: $(rustc --version)"
fi

# Ensure cargo is in PATH
export PATH="$HOME/.cargo/bin:$PATH"

# Install Solana CLI
echo ""
echo "☀️  Installing Solana CLI..."
if ! command -v solana &> /dev/null; then
    sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
    echo "✅ Solana installed: $(solana --version)"
else
    echo "✅ Solana already installed: $(solana --version)"
fi

# Install Anchor CLI
echo ""
echo "⚓ Installing Anchor CLI (this may take 5-10 minutes)..."
if ! command -v anchor &> /dev/null; then
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
    
    # Install latest Anchor version
    "$HOME/.cargo/bin/avm" install latest
    "$HOME/.cargo/bin/avm" use latest
    
    echo "✅ Anchor installed: $(anchor --version)"
else
    echo "✅ Anchor already installed: $(anchor --version)"
fi

# Update .bashrc with PATH exports
echo ""
echo "📝 Updating .bashrc with PATH configurations..."

# Add to .bashrc if not already present
grep -qxF 'export PATH="$HOME/.cargo/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
grep -qxF 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' ~/.bashrc || echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc

# Source the updated .bashrc
source ~/.bashrc

echo ""
echo "=========================================="
echo "✅ All prerequisites installed successfully!"
echo "=========================================="
echo ""
echo "Installed versions:"
echo "  Node.js: $(node --version)"
echo "  NPM: $(npm --version)"
echo "  Yarn: $(yarn --version)"
echo "  Rust: $(rustc --version)"
echo "  Cargo: $(cargo --version)"
echo "  Solana: $(solana --version)"
echo "  Anchor: $(anchor --version)"
echo ""
echo "Next steps:"
echo "1. Navigate to project:"
echo "   cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone"
echo ""
echo "2. Configure Solana for testnet:"
echo "   solana config set --url https://api.testnet.solana.com"
echo ""
echo "3. Create admin keypair:"
echo "   solana-keygen new --outfile keys/admin-keypair.json"
echo ""
echo "4. Get testnet SOL:"
echo "   solana airdrop 2"
echo ""
echo "5. Build protocol-v2:"
echo "   cd protocol-v2"
echo "   yarn install"
echo "   anchor build"
echo ""
echo "🚀 Ready to build your Perps exchange!"
