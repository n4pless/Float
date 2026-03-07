const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");
(async () => {
  const c = new Connection("https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/");
  const a = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json"))));
  console.log("Admin:", (await c.getBalance(a.publicKey)) / 1e9, "SOL");
  
  if (fs.existsSync("/tmp/deploy-buffer-kp.json")) {
    const b = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("/tmp/deploy-buffer-kp.json"))));
    console.log("Buffer pubkey:", b.publicKey.toBase58());
    const i = await c.getAccountInfo(b.publicKey);
    console.log("Exists:", !!i);
    if (i) console.log("Balance:", i.lamports / 1e9, "SOL, Data:", i.data.length, "bytes");
  } else {
    console.log("No buffer keypair file at /tmp/deploy-buffer-kp.json");
  }
})();
