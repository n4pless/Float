# Phase 1 Setup Script - Drift Clone Perps Exchange (PowerShell)

Write-Host "🚀 Starting Phase 1 Setup for Drift Clone" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green

# Create directory structure
Write-Host "`n📁 Creating directory structure..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "scripts" | Out-Null
New-Item -ItemType Directory -Force -Path "docs" | Out-Null
New-Item -ItemType Directory -Force -Path "config" | Out-Null
New-Item -ItemType Directory -Force -Path "keys" | Out-Null

# Clone repositories
Write-Host "`n📦 Cloning Drift repositories..." -ForegroundColor Yellow
git clone https://github.com/drift-labs/protocol-v2
git clone https://github.com/drift-labs/dlob-server
git clone https://github.com/drift-labs/keeper-bots-v2
git clone https://github.com/drift-labs/drift-common

Write-Host "`n✅ Repositories cloned successfully!" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Install Solana CLI: https://docs.solana.com/cli/install-solana-cli-tools"
Write-Host "2. Install Anchor: cargo install --git https://github.com/coral-xyz/anchor avm --locked --force"
Write-Host "3. Configure Solana for testnet: solana config set --url https://api.testnet.solana.com"
Write-Host "4. Create admin keypair: solana-keygen new --outfile keys/admin-keypair.json"
Write-Host "5. Request airdrop: solana airdrop 5"
Write-Host "`nThen proceed to protocol-v2 directory to build and deploy!"
