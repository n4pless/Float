// Recover buffer keypairs from seed phrases and close them to reclaim SOL
const crypto = require('crypto');
const { Keypair, Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');

const RPC = "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966";
const conn = new Connection(RPC, "confirmed");

// BIP39 mnemonic to seed (same as solana-keygen recover)
function mnemonicToSeed(mnemonic, passphrase = '') {
  return crypto.pbkdf2Sync(
    Buffer.from(mnemonic.normalize('NFKD'), 'utf8'),
    Buffer.from(('mnemonic' + passphrase).normalize('NFKD'), 'utf8'),
    2048,
    64,
    'sha512'
  );
}

const SEEDS = [
  "stem grocery mammal method multiply planet wood uniform wonder convince machine volcano",
  "erode master purity average force enlist owner dolphin reopen runway ensure forest"
];

const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

(async () => {
  // Load admin keypair
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json", "utf8")))
  );
  console.log("Admin:", adminKp.publicKey.toBase58());

  const adminBal = await conn.getBalance(adminKp.publicKey);
  console.log("Admin balance:", adminBal / 1e9, "SOL\n");

  let totalRecovered = 0;

  for (let i = 0; i < SEEDS.length; i++) {
    const seed = mnemonicToSeed(SEEDS[i]);
    const kp = Keypair.fromSeed(seed.slice(0, 32));
    console.log(`Buffer ${i + 1}: ${kp.publicKey.toBase58()}`);

    try {
      const info = await conn.getAccountInfo(kp.publicKey);
      if (!info) {
        console.log(`  Account does not exist (no SOL to recover)\n`);
        continue;
      }

      const lamports = info.lamports;
      console.log(`  Balance: ${lamports / 1e9} SOL`);
      console.log(`  Owner: ${info.owner.toBase58()}`);
      console.log(`  Data length: ${info.data.length}`);

      if (info.owner.equals(BPF_LOADER)) {
        // This is a BPF buffer account - use solana program close
        // We need to use the BPF upgradeable loader's Close instruction
        // Instruction layout: [5, 0, 0, 0] (Close = index 5)
        const closeIx = {
          keys: [
            { pubkey: kp.publicKey, isSigner: false, isWritable: true },      // buffer
            { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },  // recipient
            { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },  // authority
          ],
          programId: BPF_LOADER,
          data: Buffer.from([5, 0, 0, 0]),  // Close instruction
        };

        const tx = new Transaction().add(closeIx);
        try {
          const sig = await sendAndConfirmTransaction(conn, tx, [adminKp]);
          console.log(`  CLOSED! tx: ${sig}`);
          totalRecovered += lamports;
        } catch (e) {
          console.log(`  Close failed: ${e.message}`);
          
          // Alternative: try with buffer signer too
          try {
            const tx2 = new Transaction().add(closeIx);
            const sig2 = await sendAndConfirmTransaction(conn, tx2, [adminKp, kp]);
            console.log(`  CLOSED (with buffer signer)! tx: ${sig2}`);
            totalRecovered += lamports;
          } catch (e2) {
            console.log(`  Close with buffer signer also failed: ${e2.message}`);
          }
        }
      } else {
        console.log(`  Not a BPF account, skipping`);
      }
      console.log();
    } catch (e) {
      console.log(`  Error checking: ${e.message}\n`);
    }
  }

  const finalBal = await conn.getBalance(adminKp.publicKey);
  console.log(`Total recovered: ${totalRecovered / 1e9} SOL`);
  console.log(`Final admin balance: ${finalBal / 1e9} SOL`);
})();
