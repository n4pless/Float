# WSL2 Setup Guide for Drift Clone

## Why WSL2?
- ✅ No permission issues
- ✅ Better compatibility with Linux-based tools (Solana, Anchor)
- ✅ Faster build times
- ✅ Access Windows files seamlessly
- ✅ Native experience for blockchain development

---

## Step 1: Install WSL2 (5-10 minutes)

### Check if WSL is Already Installed
```powershell
wsl --version
```

If you see version info, WSL2 is installed! Skip to Step 2.

### Install WSL2 (if not installed)

**Modern Method (Windows 11 or Windows 10 version 2004+):**
```powershell
# Open PowerShell as Administrator
wsl --install
```

This will:
- Enable WSL feature
- Install Ubuntu (default distribution)
- Set WSL 2 as default
- Restart may be required

**After restart:**
- Ubuntu terminal will open automatically
- Create a username and password (save these!)

**Manual Method (if above doesn't work):**
1. Open PowerShell as Administrator
2. Run these commands:
```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```
3. Restart your computer
4. Download WSL2 kernel update: https://aka.ms/wsl2kernel
5. Set WSL2 as default:
```powershell
wsl --set-default-version 2
```
6. Install Ubuntu from Microsoft Store

---

## Step 2: Install Ubuntu Distribution

**If not automatically installed:**
```powershell
# List available distributions
wsl --list --online

# Install Ubuntu (recommended)
wsl --install -d Ubuntu-22.04
```

**Launch Ubuntu:**
- Search for "Ubuntu" in Start Menu
- Or run: `wsl` in PowerShell

**First time setup:**
- Create a UNIX username (lowercase, no spaces)
- Create a password (you'll need this for sudo)

---

## Step 3: Update Ubuntu & Install Prerequisites

**Open Ubuntu terminal and run:**

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install essential build tools
sudo apt install -y curl wget git build-essential pkg-config libssl-dev libudev-dev

# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js
node --version
npm --version
```

---

## Step 4: Install Rust & Cargo

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Select option 1 (default installation)
# Close and reopen terminal, or run:
source $HOME/.cargo/env

# Verify
rustc --version
cargo --version
```

---

## Step 5: Install Solana CLI

```bash
# Install Solana CLI (v1.18.26)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"

# Add to PATH (add to ~/.bashrc for permanent)
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify installation
solana --version
```

Should show: `solana-cli 1.18.26`

---

## Step 6: Install Anchor CLI

```bash
# Install Anchor Version Manager (AVM)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

# Add to PATH
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install latest Anchor
avm install latest
avm use latest

# Verify
anchor --version
```

Should show: `anchor-cli 0.30.1` (or similar)

---

## Step 7: Install Yarn (Optional but Recommended)

```bash
# Install Yarn
npm install -g yarn

# Verify
yarn --version
```

---

## Step 8: Access Your Windows Files

Your Windows drives are mounted at `/mnt/`:
- C drive: `/mnt/c/`
- D drive: `/mnt/d/`

**Navigate to your project:**
```bash
cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone
```

**Pro Tip:** Create a symlink for easier access:
```bash
# Create symlink in your Linux home directory
ln -s /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone ~/drift-clone

# Now you can use:
cd ~/drift-clone
```

---

## Step 9: Verify All Prerequisites

```bash
# Run verification script
cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone

echo "=== Prerequisites Check ==="
echo ""
echo "Node.js: $(node --version)"
echo "NPM: $(npm --version)"
echo "Rust: $(rustc --version)"
echo "Cargo: $(cargo --version)"
echo "Solana: $(solana --version)"
echo "Anchor: $(anchor --version)"
echo ""
echo "✅ All prerequisites installed!"
```

---

## Step 10: Configure Solana for Testnet

```bash
# Set cluster to testnet
solana config set --url https://api.testnet.solana.com

# Verify configuration
solana config get

# Create keys directory (if accessing from WSL)
mkdir -p keys

# Create admin keypair
solana-keygen new --outfile keys/admin-keypair.json

# Get testnet SOL (run multiple times if needed)
solana airdrop 2 keys/admin-keypair.json
solana airdrop 2 keys/admin-keypair.json

# Check balance
solana balance keys/admin-keypair.json
```

---

## Quick Reference Commands

**Launch WSL:**
```powershell
# From Windows PowerShell
wsl
```

**Access project in WSL:**
```bash
cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone
```

**Exit WSL:**
```bash
exit
```

**Shutdown WSL (from PowerShell):**
```powershell
wsl --shutdown
```

**Check WSL status:**
```powershell
wsl --list --verbose
```

---

## Common WSL Tips

**File Performance:**
- For best performance, clone repos inside WSL filesystem (`~/projects/`)
- Or work from Windows but run commands in WSL
- Current setup (Windows files accessed via `/mnt/c/`) works but may be slower

**VS Code Integration:**
- Install "WSL" extension in VS Code
- Open folder in WSL: `code .` from WSL terminal
- Or use "Remote - WSL" from VS Code

**Git Configuration:**
```bash
# Configure git in WSL
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Troubleshooting

**"WSL 2 requires an update to its kernel component":**
- Download: https://aka.ms/wsl2kernel
- Install and retry

**"This operation returned because the timeout period expired":**
- Restart WSL: `wsl --shutdown` in PowerShell
- Launch again: `wsl`

**Permission denied errors:**
- Use `sudo` before commands that need admin rights
- Check file permissions: `ls -la`

**Can't find files:**
- Remember Windows paths use `/mnt/c/` prefix in WSL
- Use `pwd` to see current directory

---

## Next Steps After WSL Setup

Once all prerequisites are installed:

1. ✅ Navigate to project:
   ```bash
   cd /mnt/c/Users/wesle/Documents/GitHub/Drift-Clone
   ```

2. ✅ Build protocol-v2:
   ```bash
   cd protocol-v2
   yarn install
   anchor build
   ```

3. ✅ Deploy to testnet:
   ```bash
   anchor deploy --provider.cluster testnet
   ```

4. ✅ Continue with Phase 1 checklist

---

**Ready to start?** Follow the steps above and let me know when you reach Step 10!
