#!/bin/bash
# Drift-Clone deployment script for Ubuntu (Hetzner)
# This script will:
# 1. Clone your repo (if not already cloned)
# 2. Install dependencies (Rust, Solana, Anchor, Node.js, npm, pm2)
# 3. Build and run Drift validator (localnet) with pm2
# 4. Build and run frontend with pm2
#
# NOTE: Does NOT touch existing pm2 apps or configs.
#
# Usage: bash setup-drift.sh

set -e

REPO_URL="https://github.com/n4pless/Drift-Clone.git"
REPO_DIR="$HOME/Drift-Clone"

# 1. Clone repo if not present
if [ ! -d "$REPO_DIR" ]; then
  git clone --recurse-submodules "$REPO_URL" "$REPO_DIR"
fi
cd "$REPO_DIR"
git pull

echo "[1/5] Installing system dependencies..."
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev curl git python3 python3-pip

# 2. Install Node.js (LTS) and npm if not present
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# 3. Install pm2 globally if not present
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

# 4. Install Rust (if not present)
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  source $HOME/.cargo/env
fi

# 5. Install Solana CLI (v1.18.26)
if ! command -v solana >/dev/null 2>&1; then
  sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
  export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# 6. Install Anchor (avm)
if ! command -v avm >/dev/null 2>&1; then
  cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
fi
export PATH="$HOME/.cargo/bin:$PATH"
avm install 0.29.0
avm use 0.29.0

# 7. Build protocol (validator)
cd "$REPO_DIR/protocol-v2"
anchor build

# 8. Start Drift validator (localnet) with pm2
cd "$REPO_DIR"
pm install
echo "Starting Drift localnet with pm2..."
pm run localnet:pm2 || pm2 start scripts/init-drift-localnet.mjs --name drift-localnet --interpreter node

# 9. Build and start frontend with pm2
cd "$REPO_DIR/frontend"
npm install
npm run build
pm2 start "npm run dev" --name drift-frontend --cwd "$REPO_DIR/frontend"

# 10. Show pm2 status
echo "\nDeployment complete!"
pm2 status

echo "\nDrift validator (localnet) and frontend are running under pm2."
echo "You can manage them with 'pm2 status', 'pm2 logs drift-frontend', etc."
