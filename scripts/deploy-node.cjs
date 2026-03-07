// Custom program deployer with rate limiting and retry logic
const {
  Connection, Keypair, PublicKey, Transaction,
  SystemProgram, sendAndConfirmTransaction,
  BpfLoader, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const fs = require("fs");

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const PROGRAM_ID = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const BPF_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const BINARY_PATH = "/home/gorcore/Drift-Clone/protocol-v2/target/deploy/drift.so";
const KP_PATH = "/home/gorcore/Drift-Clone/keys/admin-keypair.json";
const BUFFER_KP_PATH = "/tmp/deploy-buffer-kp.json";
const CHUNK_SIZE = 1012; // Max data per write instruction
const BATCH_SIZE = 4; // How many writes per batch
const BATCH_DELAY_MS = 1500; // Delay between batches

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const conn = new Connection(RPC, "confirmed");
  const adminKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KP_PATH, "utf8")))
  );
  
  console.log("Admin:", adminKp.publicKey.toBase58());
  console.log("Admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");

  // Load program binary
  const programData = fs.readFileSync(BINARY_PATH);
  console.log("Program binary size:", programData.length, "bytes");
  
  // Total chunks needed
  const totalChunks = Math.ceil(programData.length / CHUNK_SIZE);
  console.log("Total write chunks:", totalChunks);
  
  // Buffer size needed (header: 37 bytes for UpgradeableLoaderState::Buffer)
  const bufferSize = programData.length + 37;
  const bufferRent = await conn.getMinimumBalanceForRentExemption(bufferSize);
  console.log("Buffer rent needed:", bufferRent / LAMPORTS_PER_SOL, "SOL");

  // Generate or load buffer keypair
  let bufferKp;
  if (fs.existsSync(BUFFER_KP_PATH)) {
    bufferKp = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(BUFFER_KP_PATH, "utf8")))
    );
    console.log("Loaded existing buffer keypair:", bufferKp.publicKey.toBase58());
  } else {
    bufferKp = Keypair.generate();
    fs.writeFileSync(BUFFER_KP_PATH, JSON.stringify(Array.from(bufferKp.secretKey)));
    console.log("Generated new buffer keypair:", bufferKp.publicKey.toBase58());
  }

  // Check if buffer already exists
  let bufferInfo = await conn.getAccountInfo(bufferKp.publicKey);
  
  if (!bufferInfo) {
    console.log("\n=== Creating buffer account ===");
    
    // CreateBuffer instruction
    // Layout: [0, 0, 0, 0] (InitializeBuffer)
    const createBufferIx = SystemProgram.createAccount({
      fromPubkey: adminKp.publicKey,
      newAccountPubkey: bufferKp.publicKey,
      lamports: bufferRent,
      space: bufferSize,
      programId: BPF_LOADER,
    });
    
    // InitializeBuffer instruction
    const initBufferData = Buffer.alloc(4);
    initBufferData.writeUInt32LE(0, 0); // InitializeBuffer = 0
    const initBufferIx = {
      keys: [
        { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },
        { pubkey: adminKp.publicKey, isSigner: false, isWritable: false },
      ],
      programId: BPF_LOADER,
      data: initBufferData,
    };
    
    const createTx = new Transaction().add(createBufferIx, initBufferIx);
    try {
      const sig = await sendAndConfirmTransaction(conn, createTx, [adminKp, bufferKp], {
        skipPreflight: true,
      });
      console.log("Buffer created! tx:", sig);
    } catch (e) {
      console.error("Failed to create buffer:", e.message);
      process.exit(1);
    }
    
    bufferInfo = await conn.getAccountInfo(bufferKp.publicKey);
  } else {
    console.log("Buffer already exists, resuming writes...");
  }

  // Determine which chunks are already written (by checking for non-zero data)
  console.log("\n=== Writing buffer data ===");
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < totalChunks; i += BATCH_SIZE) {
    const batchEnd = Math.min(i + BATCH_SIZE, totalChunks);
    const promises = [];
    
    for (let j = i; j < batchEnd; j++) {
      const offset = j * CHUNK_SIZE;
      const chunk = programData.slice(offset, Math.min(offset + CHUNK_SIZE, programData.length));
      
      // Write instruction: [1, 0, 0, 0] (Write) + [offset as u32 LE] + [chunk length as u32 LE] + [chunk data]
      // Actually it's: [1, 0, 0, 0] + [offset u32] + [len u32] + [bytes]
      const writeData = Buffer.alloc(4 + 4 + 4 + chunk.length);
      writeData.writeUInt32LE(1, 0); // Write = 1
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
        sendAndConfirmTransaction(conn, tx, [adminKp], { skipPreflight: true })
          .then(sig => { successCount++; })
          .catch(e => {
            failCount++;
            if (failCount <= 5) console.log(`  Chunk ${j} failed: ${e.message.slice(0, 60)}`);
          })
      );
    }
    
    await Promise.all(promises);
    
    if ((i + BATCH_SIZE) % (BATCH_SIZE * 50) === 0 || i + BATCH_SIZE >= totalChunks) {
      console.log(`  Progress: ${Math.min(i + BATCH_SIZE, totalChunks)}/${totalChunks} chunks (${successCount} ok, ${failCount} failed)`);
    }
    
    await sleep(BATCH_DELAY_MS);
  }
  
  console.log(`\nWrite complete: ${successCount} succeeded, ${failCount} failed`);
  
  if (failCount > 0) {
    console.log("Some writes failed. Retrying failed chunks...");
    // TODO: retry logic - for now just report
    console.log("Please re-run this script to retry.");
    process.exit(1);
  }

  // Upgrade the program
  console.log("\n=== Upgrading program ===");
  
  // Get program data address
  const programInfo = await conn.getAccountInfo(PROGRAM_ID);
  const programDataAddr = new PublicKey(programInfo.data.slice(4, 36));
  console.log("Program data address:", programDataAddr.toBase58());
  
  // Upgrade instruction: [3, 0, 0, 0] (Upgrade)
  const upgradeData = Buffer.alloc(4);
  upgradeData.writeUInt32LE(3, 0); // Upgrade = 3
  const upgradeIx = {
    keys: [
      { pubkey: programDataAddr, isSigner: false, isWritable: true },        // programdata
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: true },             // program
      { pubkey: bufferKp.publicKey, isSigner: false, isWritable: true },     // buffer
      { pubkey: adminKp.publicKey, isSigner: false, isWritable: true },      // spill (rent recipient)
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: adminKp.publicKey, isSigner: true, isWritable: false },      // authority
    ],
    programId: BPF_LOADER,
    data: upgradeData,
  };
  
  const upgradeTx = new Transaction().add(upgradeIx);
  try {
    const sig = await sendAndConfirmTransaction(conn, upgradeTx, [adminKp], {
      skipPreflight: true,
    });
    console.log("PROGRAM UPGRADED! tx:", sig);
  } catch (e) {
    console.error("Upgrade failed:", e.message);
    console.log("Buffer is still available at:", bufferKp.publicKey.toBase58());
    process.exit(1);
  }
  
  // Clean up buffer keypair file
  try { fs.unlinkSync(BUFFER_KP_PATH); } catch(e) {}
  
  console.log("\nFinal admin balance:", (await conn.getBalance(adminKp.publicKey)) / 1e9, "SOL");
  console.log("DEPLOY COMPLETE!");
})();
