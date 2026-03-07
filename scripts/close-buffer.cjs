// Recover a specific buffer and close it
const crypto = require('crypto');
const { Keypair, Connection, PublicKey, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const conn = new Connection(RPC, "confirmed");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

function mnemonicToSeed(mnemonic, passphrase = '') {
  return crypto.pbkdf2Sync(
    Buffer.from(mnemonic.normalize('NFKD'), 'utf8'),
    Buffer.from(('mnemonic' + passphrase).normalize('NFKD'), 'utf8'),
    2048, 64, 'sha512'
  );
}

(async () => {
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  
  const mnemonic = process.argv[2] || "build slender dwarf forward lion wear evoke secret process female capital bitter";
  console.log("Recovering:", mnemonic);
  
  const seed = mnemonicToSeed(mnemonic);
  const kp = Keypair.fromSeed(seed.slice(0, 32));
  console.log("Buffer pubkey:", kp.publicKey.toBase58());

  const info = await conn.getAccountInfo(kp.publicKey);
  if (!info) {
    console.log("Account does not exist");
    return;
  }
  
  console.log("Balance:", info.lamports / 1e9, "SOL");
  
  if (info.owner.equals(BPF_LOADER)) {
    const closeIx = {
      keys: [
        { pubkey: kp.publicKey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
      ],
      programId: BPF_LOADER,
      data: Buffer.from([5, 0, 0, 0]),
    };
    const tx = new Transaction().add(closeIx);
    const sig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
    console.log("CLOSED! tx:", sig);
  }
  
  const bal = await conn.getBalance(adminKp.publicKey);
  console.log("Admin balance:", bal / 1e9, "SOL");
})();
