// Check specific candidate accounts and close any buffers
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

const CANDIDATES = [
  "EVCLDKxHxtmhc6kPpBZwH1JcNFhxpq4djFDd19YMsNoB",
  "87Qoav8o4zqca6YzPiqucFD8defemigmFEzzMCKdC4Rx",
  "8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG",
];

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL\n");

  for (const addr of CANDIDATES) {
    console.log(`Checking ${addr}...`);
    const pubkey = new PublicKey(addr);
    const info = await conn.getAccountInfo(pubkey);
    
    if (!info) {
      console.log("  -> Not found\n");
      continue;
    }
    
    console.log(`  Owner: ${info.owner.toBase58()}`);
    console.log(`  Balance: ${info.lamports / 1e9} SOL`);
    console.log(`  Data length: ${info.data.length}`);
    
    if (info.owner.equals(BPF_LOADER)) {
      const type = info.data.readUInt32LE(0);
      console.log(`  BPF type: ${type} (1=Buffer, 2=ProgramData, 3=Program)`);
      
      if (info.data.length >= 37) {
        const hasAuth = info.data[4] === 1;
        if (hasAuth) {
          const authority = new PublicKey(info.data.slice(5, 37));
          console.log(`  Authority: ${authority.toBase58()}`);
          
          if (type === 1 && authority.equals(adminKp.publicKey)) {
            console.log("  -> THIS IS OUR BUFFER! CLOSING...");
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
            try {
              const sig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
              console.log(`  CLOSED! tx: ${sig}`);
            } catch (e) {
              console.log(`  Close failed: ${e.message}`);
            }
          }
        }
      }
    }
    console.log();
  }

  console.log("Final admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
