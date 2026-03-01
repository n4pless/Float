// Brute force find buffer: scan admin's recent tx for any large account creations
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SYSTEM = new PublicKey("11111111111111111111111111111111");
const KNOWN = new Set([
  "DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G",
  "BPFLoaderUpgradeab1e11111111111111111111111111",
  "11111111111111111111111111111111",
  "SysvarRent111111111111111111111111111111111",
  "SysvarC1ock11111111111111111111111111111111",
  "EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE",
  "2pAqZGKRcXum6QvhSqtNEWJkx4arKvqdSPbYbhkG7HMk",
]);

(async () => {
  // Try both RPCs
  for (const rpcUrl of [
    "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966",
    "https://api.devnet.solana.com"
  ]) {
    console.log(`\n=== RPC: ${rpcUrl.slice(0, 50)} ===`);
    const conn = new Connection(rpcUrl, "confirmed");
    
    const adminKp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
    );

    try {
      const sigs = await conn.getSignaturesForAddress(adminKp.publicKey, { limit: 20 });
      console.log(`Found ${sigs.length} signatures`);
      
      for (let i = 0; i < Math.min(sigs.length, 15); i++) {
        await sleep(800);
        try {
          const tx = await conn.getTransaction(sigs[i].signature, { maxSupportedTransactionVersion: 0 });
          if (!tx) continue;
          
          const msg = tx.transaction.message;
          const keys = msg.staticAccountKeys || msg.accountKeys;
          const unknown = keys.filter(k => !KNOWN.has(k.toBase58())).map(k => k.toBase58());
          
          if (unknown.length > 0) {
            console.log(`\nTx ${i}: ${sigs[i].signature.slice(0, 20)}...`);
            console.log(`  Time: ${new Date(sigs[i].blockTime * 1000).toISOString()}`);
            console.log(`  Status: ${sigs[i].err ? 'FAILED' : 'OK'}`);
            console.log(`  Unknown accounts: ${unknown.join(', ')}`);
            
            // Check if any of these are BPF buffers
            for (const addr of unknown) {
              await sleep(300);
              try {
                const info = await conn.getAccountInfo(new PublicKey(addr));
                if (info && info.owner.equals(BPF_LOADER)) {
                  const type = info.data.readUInt32LE(0);
                  console.log(`  -> ${addr}: BPF type=${type}, ${info.lamports/1e9} SOL, ${info.data.length} bytes`);
                  if (type === 1) {
                    console.log(`  -> THIS IS A BUFFER! CLOSING...`);
                    const closeIx = {
                      keys: [
                        { pubkey: new PublicKey(addr), isSigner: false, isWritable: true },
                        { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
                        { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
                      ],
                      programId: BPF_LOADER,
                      data: Buffer.from([5, 0, 0, 0]),
                    };
                    const closeTx = new Transaction().add(closeIx);
                    const closeSig = await sendAndConfirmTransaction(conn, closeTx, [adminKp]);
                    console.log(`  -> CLOSED! tx: ${closeSig}`);
                  }
                }
              } catch (e) { /* skip */ }
            }
          }
        } catch (e) {
          if (e.message.includes("429")) {
            console.log(`  Rate limited, waiting...`);
            await sleep(5000);
          }
        }
      }
    } catch (e) {
      console.log(`Error: ${e.message.slice(0, 100)}`);
    }
  }

  const conn = new Connection("https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966");
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("\nFinal admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
