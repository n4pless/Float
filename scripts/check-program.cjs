const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const fs = require("fs");

(async () => {
  const conn = new Connection("https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/");
  
  // Check program
  const programId = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
  const info = await conn.getAccountInfo(programId);
  
  if (info) {
    // UpgradeableLoaderState Program variant: 
    // bytes 0-3 = type (3 for Program)
    // bytes 4-35 = programdata address
    const programDataAddr = new PublicKey(info.data.slice(4, 36));
    console.log("Program data address:", programDataAddr.toBase58());
    
    const pdInfo = await conn.getAccountInfo(programDataAddr);
    if (pdInfo) {
      console.log("Program data balance:", pdInfo.lamports / 1e9, "SOL");
      console.log("Program data length:", pdInfo.data.length);
      
      // ProgramData variant (type 2): bytes 4-11 = slot, bytes 12-44 = upgrade authority
      const slot = pdInfo.data.readBigUInt64LE(4);
      console.log("Last deployed slot:", slot.toString());
    }
  }
  
  // Check admin balance  
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json"))));
  const bal = await conn.getBalance(kp.publicKey);
  console.log("Admin balance:", bal / 1e9, "SOL");
  
  // Check current slot
  const currentSlot = await conn.getSlot();
  console.log("Current slot:", currentSlot);
})();
