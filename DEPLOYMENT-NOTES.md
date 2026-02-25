# Deployment Notes

## 💰 Funding Requirements

The Drift protocol program (6.4 MB) requires approximately **46.4 SOL** for deployment on devnet to cover:
- Program account rent exemption
- Transaction fees

Current admin balance: **10 SOL** ❌ Insufficient

### Buffer Recovery Phrase (if needed)
```
arena kite cycle salt first flat range rent mammal joy else napkin
```

## 🚨 Next Steps

### Option 1: Get More SOL from Web Faucet
1. Visit https://faucet.solana.com/
2. Enter admin pubkey: `DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G`
3. Request airdrops until you have ~50 SOL total
4. Retry deployment

### Option 2: Deploy to Localnet Instead
Localnet has unlimited SOL and is better for development:
```powershell
# Start local validator in one terminal (background)
docker run -d --name drift-validator -p 8899:8899 drift-dev bash -c "solana-test-validator"

# Deploy in another terminal
docker run --rm --network container:drift-validator -v C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2:/workdir -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys drift-dev bash -c "solana airdrop 100 DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G --url http://localhost:8899 && solana program deploy /workdir/target/deploy/drift.so --program-id /workdir/target/deploy/drift-keypair.json --url http://localhost:8899 --keypair /root/keys/admin-keypair.json"
```

### Option 3: Use Smaller Test Program
Deploy only the token_faucet program (248 KB) first to test:
```powershell
docker run --rm -v C:\Users\wesle\Documents\GitHub\Drift-Clone\protocol-v2:/workdir -v C:\Users\wesle\Documents\GitHub\Drift-Clone\keys:/root/keys drift-dev bash -c "solana config set --url https://api.devnet.solana.com && solana config set --keypair /root/keys/admin-keypair.json && cd /workdir && solana program deploy target/deploy/token_faucet.so --program-id target/deploy/token_faucet-keypair.json"
```

## 📊 Program Sizes
```
drift.so                  : 6.4 MB (~46.4 SOL needed)
token_faucet.so          : 248 KB (~1.8 SOL needed)
pyth.so                  : 185 KB (~1.3 SOL needed)
switchboard.so           : 174 KB (~1.3 SOL needed)
switchboard_on_demand.so : 174 KB (~1.3 SOL needed)
```

## 🎯 Recommended: Use Localnet

For development and testing, **localnet is the best choice** because:
- ✅ Unlimited SOL
- ✅ Fast transactions
- ✅ No rate limits
- ✅ Full control
- ✅ Can deploy all programs easily

Devnet is better for:
- Public testing
- Integration with other devnet programs
- Demonstrating to others
