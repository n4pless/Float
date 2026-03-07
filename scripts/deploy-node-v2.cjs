// Custom program deployer v2 - single writes with delays
const {
  Connection, Keypair, PublicKey, Transaction,
  SystemProgram, sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const PROGRAM_ID = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const BINARY_PATH = "/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so";
const KP_PATH = "/home/gorcore/Drift-Clone/keys/admin-keypair.json";
const BUFFER_KP_PATH = "/tmp/deploy-buffer-kp.json";
const CHUNK_SIZE = 1012;
const WRITE_DELAY_MS = 200; // Delay between individual writes
const MAX_RETRIES = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const conn = new Connection(RPC, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 });
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KP_PATH, "utf8")))
  );
  
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");

  const programData = fs.readFileSync(BINARY_PATH);
  console.log("Program binary size:", programData.length, "bytes");
  
  const totalChunks = Math.ceil(programData.length / CHUNK_SIZE);
  console.log("Total write chunks:", totalChunks);
  
  const bufferSize = programData.length + 37; // 37 bytes header
  const bufferRent = await conn.getMinimumBalanceForRentExemption(bufferSize);
  console.log("Buffer rent:", bufferRent / LAMPORTS_PER_SOL, "SOL");

  // Load or create buffer keypair
  let bufferKp;
  if (fs.existsSync(BUFFER_KP_PATH)) {
    bufferKp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(BUFFER_KP_PATH, "utf8")))
    );
    console.log("Loaded buffer keypair:", bufferKp.publicKey.toBase58());
  } else {
    bufferKp = Keypair.generate();
    fs.writeFileSync(BUFFER_KP_PATH, JSON.stringify(Array.from(bufferKp.secretKey)));
    console.log("New buffer keypair:", bufferKp.publicKey.toBase58());
  }

  // Check buffer state
  let bufferInfo = await conn.getAccountInfo(bufferKp.publicKey);
  
  if (!bufferInfo) {
    console.log("\n=== Creating buffer ===");
    const createIx = SystemProgram.createAccount({
      fromPubkey: adminKp.publicKey,
      newAccountPubkey: bufferKp.publicKey,
      lamports: bufferRent,
      space: bufferSize,
      programId: BPF_LOADER,
    });
    
    const initData = Buffer.alloc(4);
    initData.writeUInt32LE(0, 0); // InitializeBuffer
    const initIx = {
      keys: [
        { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: false, isWritable: false },
      ],
      programId: BPF_LOADER,
      data: initData,
    };
    
    const tx = new Transaction().add(createIx, initIx);
    const sig = await sendAndConfirmTransaction(conn, tx, [adminKp, bufferKp], { skipPreflight: true });
    console.log("Created:", sig);
  } else {
    console.log("Buffer exists, resuming writes.");
  }

  // Figure out which chunks are already written by checking a few spots
  console.log("\n=== Scanning for already-written chunks ===");
  bufferInfo = await conn.getAccountInfo(bufferKp.publicKey);
  let startChunk = 0;
  
  if (bufferInfo) {
    // Check from the end to find the last written chunk
    const data = bufferInfo.data;
    // Buffer header is 37 bytes, then program data
    for (let i = totalChunks - 1; i >= 0; i--) {
      const offset = 37 + i * CHUNK_SIZE;
      // Check if this chunk has non-zero data
      let hasData = false;
      for (let b = offset; b < Math.min(offset + 16, data.length); b++) {
        if (data[b] !== 0) { hasData = true; break; }
      }
      if (hasData) {
        startChunk = i + 1;
        break;
      }
    }
  }
  console.log(`Starting from chunk ${startChunk}/${totalChunks}`);

  // Write chunks in batches of 8 with parallel sends
  console.log("\n=== Writing buffer ===");
  const BATCH = 8;
  let successCount = startChunk;
  let failCount = 0;
  let lastProgressReport = Date.now();
  
  for (let i = startChunk; i < totalChunks; i += BATCH) {
    const batchEnd = Math.min(i + BATCH, totalChunks);
    const promises = [];
    
    for (let j = i; j < batchEnd; j++) {
      const offset = j * CHUNK_SIZE;
      const end = Math.min(offset + CHUNK_SIZE, programData.length);
      const chunk = programData.slice(offset, end);
      
      const writeData = Buffer.alloc(4 + 4 + 4 + chunk.length);
      writeData.writeUInt32LE(1, 0); // Write
      writeData.writeUInt32LE(offset, 4);
      writeData.writeUInt32LE(chunk.length, 8);
      chunk.copy(writeData, 12);
      
      const writeIx = {
        keys: [
          { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
          { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },
        ],
        programId: BPF_LOADER,
        data: writeData,
      };
      
      const tx = new Transaction().add(writeIx);
      
      promises.push(
        (async () => {
          for (let retry = 0; retry < MAX_RETRIES; retry++) {
            try {
              await sendAndConfirmTransaction(conn, tx, [adminKp], { skipPreflight: true });
              successCount++;
              return;
            } catch (e) {
              const msg = e && e.message ? e.message : String(e);
              if (retry === MAX_RETRIES - 1) {
                failCount++;
                if (failCount <= 10) console.log(`  Chunk ${j} FAILED: ${msg.slice(0, 80)}`);
              } else {
                await sleep(1000 * (retry + 1));
              }
            }
          }
        })()
      );
    }
    
    await Promise.all(promises);
    
    // Progress report every 10 seconds or every 200 chunks
    if (Date.now() - lastProgressReport > 10000 || (i + BATCH) % 200 === 0 || i + BATCH >= totalChunks) {
      const pct = ((successCount / totalChunks) * 100).toFixed(1);
      console.log(`  ${successCount}/${totalChunks} (${pct}%) | ${failCount} failed`);
      lastProgressReport = Date.now();
    }
    
    await sleep(WRITE_DELAY_MS);
  }
  
  console.log(`\nWrite phase done: ${successCount} ok, ${failCount} failed`);
  
  if (failCount > totalChunks * 0.01) {
    console.log("Too many failures. Re-run to retry. Buffer preserved at:", bufferKp.publicKey.toBase58());
    process.exit(1);
  }

  // Upgrade
  console.log("\n=== Upgrading program ===");
  const progInfo = await conn.getAccountInfo(PROGRAM_ID);
  const progDataAddr = new PublicKey(progInfo.data.slice(4, 36));
  
  const upgradeData = Buffer.alloc(4);
  upgradeData.writeUInt32LE(3, 0); // Upgrade
  const upgradeIx = {
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
    data: upgradeData,
  };
  
  const upgradeTx = new Transaction().add(upgradeIx);
  try {
    const sig = await sendAndConfirmTransaction(conn, upgradeTx, [adminKp], { skipPreflight: true });
    console.log("UPGRADED! tx:", sig);
    try { fs.unlinkSync(BUFFER_KP_PATH); } catch(e) {}
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.log("Upgrade failed:", msg.slice(0, 200));
    console.log("Buffer preserved:", bufferKp.publicKey.toBase58());
    process.exit(1);
  }
  
  console.log("\nFinal balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
  console.log("DEPLOY COMPLETE!");
})();
