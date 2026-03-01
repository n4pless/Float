// Close the buffer at /tmp/deploy-buffer-kp.json and recover SOL
const { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  
  if (!fs.existsSync("/tmp/deploy-buffer-kp.json")) {
    console.log("No buffer keypair file found");
    console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
    return;
  }
  
  const bufferKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("/tmp/deploy-buffer-kp.json", "utf8")))
  );
  console.log("Buffer:", bufferKp.publicKey.toBase58());
  
  const info = await conn.getAccountInfo(bufferKp.publicKey);
  if (!info) {
    console.log("Buffer account not found (already closed?)");
    console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
    return;
  }
  
  console.log("Balance:", info.lamports / 1e9, "SOL");
  
  const closeIx = {
    keys: [
      { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER,
    data: Buffer.from([5, 0, 0, 0]),
  };
  
  const tx = new Transaction().add(closeIx);
  const sig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
  console.log("CLOSED! tx:", sig);
  
  // Delete the keypair file
  fs.unlinkSync("/tmp/deploy-buffer-kp.json");
  
  console.log("Final admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
})();
