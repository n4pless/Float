const { Connection, Keypair } = require("@solana/web3.js");
const fs = require("fs");

(async () => {
  const conn = new Connection("https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966");
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json"))));
  const bal = await conn.getBalance(kp.publicKey);
  console.log("Admin balance:", bal / 1e9, "SOL");
})();
