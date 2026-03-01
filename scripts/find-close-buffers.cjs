// Find all buffer accounts owned by admin and close them
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL\n");

  // Find all buffer accounts where admin is the authority
  // Buffer account layout: [1,0,0,0] (type=1 Buffer) + [1] (has authority) + [32 bytes authority pubkey]
  // We need to search for accounts owned by BPFLoaderUpgradeab1e where bytes 5-37 match admin pubkey
  
  console.log("Searching for buffer accounts with admin as authority...");
  
  const accounts = await conn.getProgramAccounts(BPF_LOADER, {
    filters: [
      { memcmp: { offset: 0, bytes: "Ag" } }, // type = 1 (Buffer) encoded as LE u32 = [1,0,0,0] → base58 "2"
    ],
    dataSlice: { offset: 0, length: 37 }, // Just get the header to check authority
  });

  // Actually let's filter differently - search for Buffer type (1) with authority matching admin
  console.log(`Found ${accounts.length} buffer accounts total`);
  
  let closedCount = 0;
  for (const { pubkey, account } of accounts) {
    // Buffer header: u32 type (4 bytes) + Option<Pubkey> authority (1 + 32 bytes)
    const type = account.data.readUInt32LE(0);
    if (type !== 1) continue; // Not a Buffer
    
    const hasAuthority = account.data[4] === 1;
    if (!hasAuthority) continue;
    
    const authority = new PublicKey(account.data.slice(5, 37));
    if (!authority.equals(adminKp.publicKey)) continue;
    
    // This is a buffer owned by admin - get full info
    const fullInfo = await conn.getAccountInfo(pubkey);
    const lamports = fullInfo.lamports;
    console.log(`\nBuffer: ${pubkey.toBase58()}`);
    console.log(`  Balance: ${lamports / 1e9} SOL`);
    console.log(`  Data length: ${fullInfo.data.length}`);
    
    // Close it
    const closeIx = {
      keys: [
        { pubkey: pubkey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
      ],
      programId: BPF_LOADER,
      data: Buffer.from([5, 0, 0, 0]),
    };
    
    try {
      const tx = new Transaction().add(closeIx);
      const sig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
      console.log(`  CLOSED! tx: ${sig}`);
      closedCount++;
    } catch (e) {
      console.log(`  Close failed: ${e.message}`);
    }
  }
  
  console.log(`\nClosed ${closedCount} buffers`);
  console.log("Final admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
