# Docker Build Guide for Drift Protocol

## Step 1: Install Docker Desktop

### Download and Install
1. Download Docker Desktop for Windows: https://www.docker.com/products/docker-desktop/
2. Run the installer
3. **Important:** Enable WSL 2 backend during installation (should be default)
4. Restart your computer if prompted

### Verify Installation
```powershell
docker --version
docker compose version
```

## Step 2: Build Drift Dev Container

### Build the Container
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2\.devcontainer
docker build -t drift-dev .
```

**This will take 10-15 minutes** - Docker will:
- Download Rust 1.70.0
- Install Solana CLI 1.16.27
- Install Anchor CLI 0.29.0
- Set up all dependencies

## Step 3: Build Protocol Inside Container

### Run Container with Project Mounted
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2

docker run -it --rm `
  -v ${PWD}:/workdir `
  -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys `
  drift-dev bash
```

### Inside the Container, Run:
```bash
cd /workdir

# Build the protocol (10-20 minutes)
anchor build

# Check the build output
ls -lh target/deploy/*.so
```

## Step 4: Deploy from Container

### Deploy to Devnet
```bash
# Still inside the container

# Configure Solana
solana config set --url https://api.devnet.solana.com
solana config set --keypair /root/keys/admin-keypair.json

# Check balance
solana balance

# Deploy!
anchor deploy --provider.cluster devnet

# Save the program ID
anchor keys list
```

## Step 5: Exit and Save Program ID

```bash
# Exit container
exit
```

The deployed program ID will be in:
- `protocol-v2/target/deploy/drift-keypair.json`
- Displayed by `anchor keys list`

## Quick Commands Reference

**Build container:**
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2\.devcontainer
docker build -t drift-dev .
```

**Run container:**
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2
docker run -it --rm -v ${PWD}:/workdir -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys drift-dev bash
```

**Inside container - Build:**
```bash
cd /workdir && anchor build
```

**Inside container - Deploy:**
```bash
solana config set --url https://api.devnet.solana.com
solana config set --keypair /root/keys/admin-keypair.json
anchor deploy --provider.cluster devnet
```

## Troubleshooting

**"Docker daemon not running":**
- Start Docker Desktop application
- Wait for it to fully start (whale icon in system tray)

**"Cannot connect to Docker daemon":**
- Ensure Docker Desktop is running
- Restart Docker Desktop
- Restart WSL: `wsl --shutdown` then reopen

**Build fails in container:**
- This shouldn't happen with official devcontainer
- Try: `docker system prune -a` and rebuild

**Mount volume issues:**
- Make sure paths use proper PowerShell format
- Use `${PWD}` for current directory

---

## What Happens Next

After deployment, you'll have:
1. ✅ Your own Drift program deployed on devnet
2. ✅ Program ID to use in your frontend
3. ✅ Ready to initialize markets (USDC, SOL-PERP)

**Then we move to Phase 1 completion:**
- Initialize protocol state
- Create USDC spot market
- Create SOL-PERP market
- Test trading!

---

**Ready to start?** Follow Step 1 to install Docker Desktop!
