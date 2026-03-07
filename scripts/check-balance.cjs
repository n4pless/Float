const { Connection, Keypair } = require("@solana/web3.js");
const fs = require("fs");

(async () => {
  const conn = new Connection("https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json"))));
  const bal = await conn.getBalance(kp.publicKey);
  console.log("Admin balance:", bal / 1e9, "SOL");
})();
