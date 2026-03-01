// Find the most recent buffer from admin transactions (with rate limit handling)
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL\n");

  // Get just the 10 most recent signatures
  const sigs = await conn.getSignaturesForAddress(adminKp.publicKey, { limit: 10 });
  console.log(`Checking ${sigs.length} most recent transactions...\n`);

  const bufferAddresses = new Set();

  for (const sig of sigs) {
    await sleep(500); // Rate limit delay
    try {
      const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.transaction || !tx.transaction.message) continue;

      const msg = tx.transaction.message;
      const accountKeys = msg.staticAccountKeys || msg.accountKeys;
      
      let involvesBPF = false;
      for (const key of accountKeys) {
        if (key.equals(BPF_LOADER)) { involvesBPF = true; break; }
      }
      
      if (involvesBPF) {
        console.log(`BPF tx: ${sig.signature.slice(0, 20)}... (${new Date(sig.blockTime * 1000).toISOString()})`);
        for (const key of accountKeys) {
          if (key.equals(adminKp.publicKey)) continue;
          if (key.equals(BPF_LOADER)) continue;
          if (key.toBase58() === "11111111111111111111111111111111") continue;
          if (key.toBase58() === "SysvarRent111111111111111111111111111111111") continue;
          if (key.toBase58() === "SysvarC1ock11111111111111111111111111111111") continue;
          // Known program accounts to skip
          if (key.toBase58() === "EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE") continue;
          if (key.toBase58() === "2pAqZGKRcXum6QvhSqtNEWJkx4arKvqdSPbYbhkG7HMk") continue;
          bufferAddresses.add(key.toBase58());
        }
      }
    } catch (e) {
      if (e.message.includes("429")) {
        console.log("Rate limited, waiting...");
        await sleep(3000);
      } else {
        console.log(`Error: ${e.message.slice(0, 80)}`);
      }
    }
  }

  console.log("\nCandidate buffer addresses:", [...bufferAddresses]);

  // Check each candidate
  for (const addr of bufferAddresses) {
    await sleep(300);
    try {
      const pubkey = new PublicKey(addr);
      const info = await conn.getAccountInfo(pubkey);
      if (!info) {
        console.log(`${addr}: not found`);
        continue;
      }
      if (!info.owner.equals(BPF_LOADER)) continue;
      
      const type = info.data.readUInt32LE(0);
      if (type !== 1) continue; // Not Buffer

      console.log(`\nBUFFER: ${addr} (${info.lamports / 1e9} SOL, ${info.data.length} bytes)`);
      
      const hasAuth = info.data[4] === 1;
      if (hasAuth) {
        const authority = new PublicKey(info.data.slice(5, 37));
        console.log(`  Authority: ${authority.toBase58()}`);
        
        if (authority.equals(adminKp.publicKey)) {
          console.log("  -> CLOSING...");
          const closeIx = {
            keys: [
              { pubkey, isSigner: false, isWritable: true },
              { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
              { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
            ],
            programId: BPF_LOADER,
            data: Buffer.from([5, 0, 0, 0]),
          };
          const tx = new Transaction().add(closeIx);
          const txSig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
          console.log(`  CLOSED! tx: ${txSig}`);
        }
      }
    } catch (e) {
      console.log(`${addr}: error ${e.message.slice(0, 60)}`);
    }
  }

  console.log("\nFinal admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
