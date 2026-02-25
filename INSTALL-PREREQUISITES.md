# Installing Prerequisites - Manual Guide

You already have ✅:
- Node.js v24.13.1
- Rust 1.93.1
- Cargo 1.93.1

## Still Need to Install:

### 1. Solana CLI (v1.18+)

**Option A: Direct Download (Recommended for Windows)**
1. Download the installer: https://github.com/solana-labs/solana/releases/download/v1.18.26/solana-install-init-x86_64-pc-windows-msvc.exe
2. Run the installer as Administrator (Right-click → Run as Administrator)
3. Follow the installation wizard
4. The installer will add Solana to your PATH
5. **Close and reopen PowerShell**
6. Verify: `solana --version`

**Option B: Using WSL (Windows Subsystem for Linux)**
```bash
# In WSL terminal
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
```

**Option C: Manual Binary Installation**
1. Download: https://github.com/solana-labs/solana/releases/download/v1.18.26/solana-release-x86_64-pc-windows-msvc.tar.bz2
2. Extract to `C:\solana`
3. Add to PATH:
   - Open Environment Variables
   - Add `C:\solana\bin` to your PATH
   - Restart PowerShell

### 2. Anchor CLI (v0.29+)

**Option A: Pre-built Binary (Recommended)**
1. Download from: https://github.com/coral-xyz/anchor/releases
2. Get the Windows binary for v0.30.1
3. Extract to a folder (e.g., `C:\anchor`)
4. Add to PATH
5. Verify: `anchor --version`

**Option B: Build from Source (after fixing dlltool)**
```powershell
# Install required Windows build tools first
# Then run:
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

**Option C: Use via Docker (Alternative)**
If installation continues to fail, you can use Anchor via Docker:
```bash
docker pull projectserum/build:v0.30.1
```

## Alternative: Use Solana Playground (No Local Installation)

If local installation is challenging, you can use **Solana Playground** for initial development:
- URL: https://beta.solpg.io/
- No installation needed - runs in browser
- Can build and deploy Anchor programs
- Export code when ready for local development

## Verification Steps

Once installed, verify everything:

```powershell
# Check all tools
node --version    # Should show v24.13.1
rustc --version   # Should show 1.93.1
cargo --version   # Should show 1.93.1
solana --version  # Should show v1.18.26 or higher
anchor --version  # Should show v0.30.1 or higher
```

## Next Steps After Installation

Once all tools are verified:

1. Return to main directory:
   ```powershell
   cd c:\Users\wesle\Documents\GitHub\Drift-Clone
   ```

2. Configure Solana for testnet:
   ```bash
   solana config set --url https://api.testnet.solana.com
   ```

3. Create admin keypair:
   ```bash
   solana-keygen new --outfile keys/admin-keypair.json
   ```

4. Get testnet SOL:
   ```bash
   solana airdrop 2
   solana airdrop 2
   ```

5. Proceed to build protocol-v2

## Troubleshooting

**"Access Denied" errors:**
- Run PowerShell as Administrator
- Check antivirus isn't blocking
- Try Option C (manual binary) instead

**"dlltool not found":**
- Install MinGW-w64: https://www.mingw-w64.org/downloads/
- Or use pre-built Anchor binaries instead

**Still having issues?**
- Use Solana Playground for initial testing
- Or use WSL2 for a Linux environment on Windows
- Join Solana Discord for help: https://discord.gg/solana

---

**Need help?** Let me know which option you'd like to try!
