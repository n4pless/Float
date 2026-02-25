# Quick Start: After Docker Installation

## Once Docker Desktop is Installed and Running

### Verify Docker is Working
```powershell
docker --version
docker run hello-world
```

### Build Drift Dev Container (15-20 minutes)
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2\.devcontainer
docker build -t drift-dev .
```

### Build Protocol in Container (10-20 minutes)
```powershell
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2

# Run container with your project mounted
docker run -it --rm `
  -v ${PWD}:/workdir `
  -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys `
  drift-dev bash

# Inside container, build:
cd /workdir
anchor build
```

### Deploy to Devnet (2-3 minutes)
```bash
# Still inside container
solana config set --url https://api.devnet.solana.com
solana config set --keypair /root/keys/admin-keypair.json
solana balance  # Should show 10 SOL

# Deploy!
anchor deploy --provider.cluster devnet

# Get your program ID
anchor keys list
```

### Exit Container
```bash
exit
```

## What You'll Have

After this process completes:
- ✅ Drift protocol built successfully
- ✅ Deployed to Solana devnet
- ✅ Your own program ID
- ✅ Ready to initialize markets

## Next: Initialize Markets

Once deployed, we'll:
1. Initialize protocol state (clearing house)
2. Create USDC spot market
3. Create SOL-PERP market  
4. Test opening your first position!

---

**Total Time:**  
- Docker install: 5-10 min
- Container build: 15-20 min  
- Protocol build: 10-20 min
- Deploy: 2-3 min
- **Total: ~45-60 minutes**

Then you'll have a fully working Perps exchange! 🚀

---

## Commands to Run After Docker Install

```powershell
# 1. Build container
cd C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2\.devcontainer
docker build -t drift-dev .

# 2. Run and build
cd ..
docker run -it --rm -v ${PWD}:/workdir -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys drift-dev bash

# 3. Inside container:
cd /workdir
anchor build
solana config set --url https://api.devnet.solana.com
solana config set --keypair /root/keys/admin-keypair.json
anchor deploy --provider.cluster devnet
anchor keys list
exit
```

That's it! Then we initialize markets and you can start trading.
