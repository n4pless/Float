# Drift Validator Backup & Restore Guide

## Server Details
- **Host**: `95.217.193.241` (Hetzner)
- **User**: `gorcore`
- **SSH Key**: `C:\Users\wesle\Downloads\Hetzner Server\gorcore_gorpc_ssh` (passphrase: `gorpc`)

## What's Running
| Service | Port | Directory |
|---------|------|-----------|
| Solana test-validator | 8899 | `~/validator-ledger/` |
| Vite frontend | 5173 | `~/Drift-Clone/frontend/` |

## Key Paths on Server
| Path | Description |
|------|-------------|
| `~/validator-ledger/` | Blockchain state (accounts, rocksdb, snapshots) |
| `~/ledger-backups/` | Automated backup storage |
| `~/ledger-backups/hourly/` | Last 24 hourly backups |
| `~/ledger-backups/daily/` | Last 7 daily backups (midnight) |
| `~/ledger-backups/backup.log` | Backup log |
| `~/backup-ledger.sh` | Backup cron script |
| `~/Drift-Clone/` | Full repo clone |
| `~/Drift-Clone/keys/admin-keypair.json` | Admin wallet keypair |
| `~/Drift-Clone/protocol-v2/target/deploy/drift.so` | Compiled Drift program |
| `~/Drift-Clone/deploy-hetzner.sh` | Full deployment script |

## Program & Account Addresses
| Item | Address |
|------|---------|
| Drift Program ID | `EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE` |
| Admin Wallet | `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G` |
| USDC Mint | `G1RCxqcc1DpLUnprWdxdZ9DsstmYmxhekZffJKNi5ths` |
| SOL Oracle (Prelaunch) | `8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG` |

## Automated Backups

Backups run automatically every hour via cron. Each backup is ~36 MB (compressed with zstd, excludes validator logs).

### Check Backup Status
```bash
ssh gorcore@95.217.193.241

# View backup log
cat ~/ledger-backups/backup.log

# List backups
ls -lh ~/ledger-backups/hourly/
ls -lh ~/ledger-backups/daily/

# Check cron is scheduled
crontab -l
# Should show: 0 * * * * /home/gorcore/backup-ledger.sh
```

### Run a Manual Backup
```bash
bash ~/backup-ledger.sh
```

---

## Restore from Backup

If the validator crashes, gets reset, or the server is rebuilt:

### 1. Stop Everything
```bash
pkill solana-test-validator
pkill -f vite
```

### 2. Pick a Backup
```bash
# List available backups (newest first)
ls -lt ~/ledger-backups/hourly/
ls -lt ~/ledger-backups/daily/
```

### 3. Restore the Ledger
```bash
# Remove the broken/empty ledger
rm -rf ~/validator-ledger

# Extract the backup (restores ~/validator-ledger/)
tar -I zstd -xf ~/ledger-backups/hourly/ledger-XXXXXXXX-XXXXXX.tar.zst -C ~/
```

### 4. Restart the Validator (WITHOUT --reset)
```bash
solana-test-validator \
  --ledger ~/validator-ledger \
  --bind-address 0.0.0.0 \
  --rpc-port 8899 \
  --bpf-program EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE \
    ~/Drift-Clone/protocol-v2/target/deploy/drift.so &
```

> **IMPORTANT**: Do NOT use `--reset` — that wipes the ledger and you lose all state.

### 5. Restart the Frontend
```bash
cd ~/Drift-Clone/frontend
npx vite --host 0.0.0.0 --port 5173 &
```

### 6. Verify
```bash
# Check validator is running
solana slot -u http://localhost:8899

# Check Drift program is loaded
solana program show EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE -u http://localhost:8899

# Check frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

---

## Full Redeploy (Fresh Start — No Backup)

If you have no backup or want to start completely fresh (all positions/balances lost):

```bash
cd ~/Drift-Clone
bash deploy-hetzner.sh
```

This will:
1. Kill existing processes
2. Start a fresh validator (with `--reset`)
3. Initialize Drift protocol (State, USDC spot market, SOL-PERP market)
4. Fetch live SOL price from Binance for oracle + AMM
5. Seed vault with 1M USDC
6. Start frontend on port 5173

---

## Server Rebuilt from Scratch

If the Hetzner server is completely gone and you have a new one:

### Prerequisites
```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source ~/.cargo/env

# Install Solana CLI 1.18.26
sh -c "$(curl -sSfL https://release.anza.xyz/v1.18.26/install)"
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Install Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor --tag v0.29.0 anchor-cli --locked
```

### Clone & Deploy
```bash
git clone git@github.com:n4pless/Drift-Clone.git ~/Drift-Clone
cd ~/Drift-Clone
bash deploy-hetzner.sh
```

### Restore Backup (if you have one)
If you copied a backup tarball to the new server:
```bash
pkill solana-test-validator
rm -rf ~/validator-ledger
tar -I zstd -xf ledger-XXXXXXXX-XXXXXX.tar.zst -C ~/
solana-test-validator \
  --ledger ~/validator-ledger \
  --bind-address 0.0.0.0 \
  --rpc-port 8899 \
  --bpf-program EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE \
    ~/Drift-Clone/protocol-v2/target/deploy/drift.so &
```

### Open Firewall
```bash
sudo ufw allow 5173/tcp
sudo ufw allow 8899/tcp
```

---

## Download a Backup to Your Local PC

From PowerShell on your Windows machine:
```powershell
# Copy latest backup to local machine
scp -i "C:\Users\wesle\Downloads\Hetzner Server\gorcore_gorpc_ssh" `
  gorcore@95.217.193.241:~/ledger-backups/hourly/ledger-XXXXXXXX-XXXXXX.tar.zst `
  C:\Users\wesle\Documents\drift-backups\
```

---

## Useful Commands

```bash
# SSH into server
ssh -i "C:\Users\wesle\Downloads\Hetzner Server\gorcore_gorpc_ssh" gorcore@95.217.193.241

# Check what's running
pgrep -a solana
pgrep -a vite

# Current block height
solana slot -u http://localhost:8899

# Validator logs (live)
tail -f ~/validator-ledger/validator.log

# Ledger size
du -sh ~/validator-ledger/

# Total backup size
du -sh ~/ledger-backups/
```
