// Deploy v3 - sequential writes with proper error handling, reuses existing buffer
const {
  Connection, Keypair, PublicKey, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966";
const PROGRAM_ID = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const BINARY_PATH = "/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so";
const KP_PATH = "/home/gorcore/Drift-Clone/keys/admin-keypair.json";
const BUFFER_KP_PATH = "/tmp/deploy-buffer-kp.json";
const CHUNK_SIZE = 1012;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KP_PATH, "utf8")))
  );
  const bufferKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(BUFFER_KP_PATH, "utf8")))
  );
  
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Buffer:", bufferKp.publicKey.toBase58());

  const programData = fs.readFileSync(BINARY_PATH);
  const totalChunks = Math.ceil(programData.length / CHUNK_SIZE);
  console.log("Binary:", programData.length, "bytes,", totalChunks, "chunks\n");

  // Test a single write first to verify it works
  console.log("=== Test write (chunk 0) ===");
  const chunk0 = programData.slice(0, Math.min(CHUNK_SIZE, programData.length));
  // bincode format: u32 variant + u32 offset + u64 vec_len + bytes
  const testData = Buffer.alloc(4 + 4 + 8 + chunk0.length);
  testData.writeUInt32LE(1, 0); // Write variant
  testData.writeUInt32LE(0, 4); // offset
  testData.writeBigUInt64LE(BigInt(chunk0.length), 8); // vec length (u64 for bincode!)
  chunk0.copy(testData, 16);
  
  const testIx = {
    keys: [
      { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER,
    data: testData,
  };
  
  const testTx = new Transaction().add(testIx);
  
  try {
    // Try WITHOUT skipPreflight first to see simulation errors
    const sig = await sendAndConfirmTransaction(conn, testTx, [adminKp]);
    console.log("Test write succeeded! tx:", sig);
  } catch (e) {
    console.log("Test write failed!");
    console.log("Error type:", e.constructor.name);
    console.log("Message:", e.message ? e.message.slice(0, 200) : "no message");
    if (e.logs) console.log("Logs:", e.logs);
    if (e.transactionError) console.log("Tx error:", JSON.stringify(e.transactionError));
    
    // Try with simulation to get details
    console.log("\n--- Simulating ---");
    try {
      const sim = await conn.simulateTransaction(testTx, [adminKp]);
      console.log("Sim result:", JSON.stringify(sim.value, null, 2));
    } catch (se) {
      console.log("Sim error:", se.message ? se.message.slice(0, 200) : String(se));
    }
    
    process.exit(1);
  }
  
  // If test write worked, proceed with all writes
  console.log("\n=== Writing all chunks ===");
  let written = 1; // chunk 0 already written
  let failed = 0;
  const startTime = Date.now();
  
  // Write in parallel batches of 6
  const BATCH = 6;
  const DELAY = 500; // ms between batches
  
  for (let i = 1; i < totalChunks; i += BATCH) {
    const batchEnd = Math.min(i + BATCH, totalChunks);
    const promises = [];
    
    for (let j = i; j < batchEnd; j++) {
      const offset = j * CHUNK_SIZE;
      const end = Math.min(offset + CHUNK_SIZE, programData.length);
      const chunk = programData.slice(offset, end);
      
      // bincode: u32 variant + u32 offset + u64 vec_len + bytes
      const wd = Buffer.alloc(4 + 4 + 8 + chunk.length);
      wd.writeUInt32LE(1, 0);
      wd.writeUInt32LE(offset, 4);
      wd.writeBigUInt64LE(BigInt(chunk.length), 8);
      chunk.copy(wd, 16);
      
      const ix = {
        keys: [
          { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
        ],
        programId: BPF_LOADER,
        data: wd,
      };
      
      promises.push(
        (async () => {
          for (let retry = 0; retry < 3; retry++) {
            try {
              const tx = new Transaction().add(ix);
              await sendAndConfirmTransaction(conn, tx, [adminKp], { skipPreflight: true });
              written++;
              return;
            } catch (err) {
              if (retry < 2) await sleep(2000 * (retry + 1));
              else { failed++; }
            }
          }
        })()
      );
    }
    
    await Promise.all(promises);
    await sleep(DELAY);
    
    // Progress every 100 chunks
    if (written % 100 < BATCH || i + BATCH >= totalChunks) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = written / elapsed;
      const eta = ((totalChunks - written) / rate).toFixed(0);
      console.log(`  ${written}/${totalChunks} (${(written/totalChunks*100).toFixed(1)}%) | ${failed} failed | ETA: ${eta}s`);
    }
  }
  
  console.log(`\nDone: ${written}/${totalChunks} written, ${failed} failed\n`);
  
  if (failed > 0) {
    console.log("Some writes failed. Buffer preserved. Re-run to retry.");
    process.exit(1);
  }
  
  // UPGRADE
  console.log("=== Upgrading program ===");
  const progInfo = await conn.getAccountInfo(PROGRAM_ID);
  const progDataAddr = new PublicKey(progInfo.data.slice(4, 36));
  
  const ud = Buffer.alloc(4);
  ud.writeUInt32LE(3, 0);
  const uix = {
    keys: [
      { pubkey: progDataAddr, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: true },
      { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
    ],
    programId: BPF_LOADER,
    data: ud,
  };
  
  const utx = new Transaction().add(uix);
  try {
    const sig = await sendAndConfirmTransaction(conn, utx, [adminKp]);
    console.log("UPGRADED! tx:", sig);
    try { fs.unlinkSync(BUFFER_KP_PATH); } catch(e) {}
    console.log("\nFinal balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
    console.log("DEPLOY COMPLETE!");
  } catch (e) {
    console.log("Upgrade failed:", e.message ? e.message.slice(0, 200) : String(e));
    if (e.logs) console.log("Logs:", e.logs);
  }
})();
