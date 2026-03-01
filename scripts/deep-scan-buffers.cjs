// Scan deeper into transaction history to find deploy buffer
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://api.devnet.solana.com"; // Use same RPC as the deploy
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());
  
  // Page through transaction history
  let lastSig = undefined;
  let bufferFound = false;
  
  for (let page = 0; page < 20 && !bufferFound; page++) {
    const opts = { limit: 100 };
    if (lastSig) opts.before = lastSig;
    
    const sigs = await conn.getSignaturesForAddress(adminKp.publicKey, opts);
    if (sigs.length === 0) {
      console.log("No more transactions");
      break;
    }
    
    console.log(`\nPage ${page}: ${sigs.length} txs (${new Date(sigs[0].blockTime * 1000).toISOString()} to ${new Date(sigs[sigs.length-1].blockTime * 1000).toISOString()})`);
    lastSig = sigs[sigs.length - 1].signature;
    
    // Sample a few txs from this page to check for BPF loader involvement
    const samplesToCheck = [0, Math.floor(sigs.length/4), Math.floor(sigs.length/2), sigs.length-1];
    
    for (const idx of samplesToCheck) {
      if (idx >= sigs.length) continue;
      await sleep(200);
      
      try {
        const tx = await conn.getTransaction(sigs[idx].signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) continue;
        
        const keys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
        const hasBPF = keys.some(k => k.equals(BPF_LOADER));
        
        if (hasBPF) {
          console.log(`  BPF tx found at idx ${idx}: ${sigs[idx].signature.slice(0,20)}...`);
          
          // Check all accounts in this tx for buffers
          for (const key of keys) {
            if (key.equals(adminKp.publicKey)) continue;
            if (key.equals(BPF_LOADER)) continue;
            if (key.toBase58().startsWith("Sysvar")) continue;
            if (key.toBase58() === "11111111111111111111111111111111") continue;
            
            const info = await conn.getAccountInfo(key);
            if (info && info.owner.equals(BPF_LOADER)) {
              const type = info.data.readUInt32LE(0);
              if (type === 1) {
                console.log(`\n  BUFFER FOUND: ${key.toBase58()}`);
                console.log(`  Balance: ${info.lamports / 1e9} SOL`);
                console.log(`  Data: ${info.data.length} bytes`);
                
                // Check authority
                const hasAuth = info.data[4] === 1;
                if (hasAuth) {
                  const auth = new PublicKey(info.data.slice(5, 37));
                  console.log(`  Authority: ${auth.toBase58()}`);
                  
                  if (auth.equals(adminKp.publicKey)) {
                    console.log("  CLOSING...");
                    const closeIx = {
                      keys: [
                        { pubkey: key, isSigner: false, isWritable: true },
                        { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
                        { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
                      ],
                      programId: BPF_LOADER,
                      data: Buffer.from([5, 0, 0, 0]),
                    };
                    // Send via helius for reliability
                    const heliusConn = new Connection("https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966");
                    const closeTx = new Transaction().add(closeIx);
                    const sig = await sendAndConfirmTransaction(heliusConn, closeTx, [adminKp]);
                    console.log(`  CLOSED! tx: ${sig}`);
                    bufferFound = true;
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        // skip
      }
    }
  }

  if (!bufferFound) {
    console.log("\nNo buffer found in transaction history.");
  }

  const heliusConn = new Connection("https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966");
  console.log("\nFinal admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
