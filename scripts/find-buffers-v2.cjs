// Find recent buffer creation from admin's transaction history
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());

  // Get recent signatures for admin
  const sigs = await conn.getSignaturesForAddress(adminKp.publicKey, { limit: 50 });
  console.log(`Found ${sigs.length} recent transactions\n`);

  // Look for create_account instructions targeting BPF loader (these create buffers)
  const bufferAddresses = new Set();
  
  for (const sig of sigs) {
    try {
      const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
      if (!tx || !tx.transaction || !tx.transaction.message) continue;
      
      const msg = tx.transaction.message;
      const accountKeys = msg.staticAccountKeys || msg.accountKeys;
      
      // Look for accounts that interacted with BPF loader
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i];
        if (key.equals(BPF_LOADER)) {
          // This tx involves BPF loader - find non-admin, non-system accounts
          for (let j = 0; j < accountKeys.length; j++) {
            const candidate = accountKeys[j];
            if (candidate.equals(adminKp.publicKey)) continue;
            if (candidate.equals(BPF_LOADER)) continue;
            if (candidate.toBase58() === "11111111111111111111111111111111") continue;
            if (candidate.toBase58() === "SysvarRent111111111111111111111111111111111") continue;
            if (candidate.toBase58() === "SysvarC1ock11111111111111111111111111111111") continue;
            // Check if this looks like a buffer
            bufferAddresses.add(candidate.toBase58());
          }
          break;
        }
      }
    } catch (e) {
      // Skip failed tx lookups
    }
  }

  console.log("Potential buffer addresses found:", [...bufferAddresses]);
  
  // Check each candidate
  for (const addr of bufferAddresses) {
    try {
      const pubkey = new PublicKey(addr);
      const info = await conn.getAccountInfo(pubkey);
      if (!info) {
        console.log(`\n${addr}: account closed/not found`);
        continue;
      }
      
      if (!info.owner.equals(BPF_LOADER)) {
        console.log(`\n${addr}: not BPF (owner: ${info.owner.toBase58()})`);
        continue;
      }
      
      const type = info.data.readUInt32LE(0);
      if (type !== 1) {
        console.log(`\n${addr}: not buffer (type=${type})`);
        continue;
      }
      
      const hasAuth = info.data[4] === 1;
      let authority = null;
      if (hasAuth) {
        authority = new PublicKey(info.data.slice(5, 37));
      }
      
      console.log(`\nBUFFER FOUND: ${addr}`);
      console.log(`  Balance: ${info.lamports / 1e9} SOL`);
      console.log(`  Data length: ${info.data.length}`);
      console.log(`  Authority: ${authority ? authority.toBase58() : 'none'}`);
      
      if (authority && authority.equals(adminKp.publicKey)) {
        console.log("  -> Admin is authority, CLOSING...");
        const closeIx = {
          keys: [
            { pubkey: pubkey, isSigner: false, isWritable: true },
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
    } catch (e) {
      console.log(`\n${addr}: error: ${e.message}`);
    }
  }

  console.log("\nFinal admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
