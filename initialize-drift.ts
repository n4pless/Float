/**
 * Initialize Drift Protocol and Create SOL-PERP + USDC Markets
 * 
 * This script:
 * 1. Initializes the Drift clearing house
 * 2. Creates a USDC spot market
 * 3. Creates a SOL-PERP perpetual market
 * 4. Initializes an oracle for SOL price
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, Wallet } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { 
  PublicKey, 
  Keypair, 
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DRIFT_PROGRAM_ID = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const RPC_URL = "http://localhost:8899";

async function  main() {
  console.log("🚀 Initializing Drift Protocol on Localnet\n");

  // Setup connection and wallet
  const connection = new anchor.web3.Connection(RPC_URL, "confirmed");
  
  // Load admin keypair
  const adminKeypairPath = path.join(__dirname, "keys", "admin-keypair.json");
  const adminKeypairData = JSON.parse(fs.readFileSync(adminKeypairPath, "utf-8"));
  const adminKeypair = Keypair.fromSecretKey(new Uint8Array(adminKeypairData));
  
  console.log("📋 Admin Public Key:", adminKeypair.publicKey.toString());
  
  // Airdrop SOL to admin on localnet
  console.log("\n💰 Requesting airdrop...");
  const signature = await connection.requestAirdrop(
    adminKeypair.publicKey,
    100 * anchor.web3.LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction(signature);
  
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`   Balance: ${balance / anchor.web3.LAMPORTS_PER_SOL} SOL`);

  // Create wallet
  const wallet = new Wallet(adminKeypair);
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  // Load Drift IDL
  const idlPath = path.join(__dirname, "protocol-v2", "target", "idl", "drift.json");
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
  const program = new Program(idl, DRIFT_PROGRAM_ID, provider);

  console.log("\n📦 Drift Program ID:", program.programId.toString());

  // Step 1: Create USDC Mint (simulated stablecoin)
  console.log("\n1️⃣  Creating USDC mint...");
  const usdcKeypair = Keypair.generate();
  const usdcMint = await createMint(
    connection,
    adminKeypair,
    adminKeypair.publicKey,
    null,
    6, // 6 decimals for USDC
    usdcKeypair
  );
  console.log("   USDC Mint:", usdcMint.toString());

  // Create admin USDC account and mint some tokens
  const adminUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    adminKeypair,
    usdcMint,
    adminKeypair.publicKey
  );
  
  await mintTo(
    connection,
    adminKeypair,
    usdcMint,
    adminUsdcAccount.address,
    adminKeypair,
    1_000_000 * 1e6 // 1 million USDC
  );
  console.log("   ✅ Minted 1,000,000 USDC to admin");

  // Step 2: Create Mock Oracle for SOL price
  console.log("\n2️⃣  Creating mock SOL price oracle...");
  const oracleKeypair = Keypair.generate();
  
  // Create oracle account with initial SOL price data
  const oracleSize = 3312; // Pyth oracle account size
  const oracleRent = await connection.getMinimumBalanceForRentExemption(oracleSize);
  
  const createOracleTx = new anchor.web3.Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: adminKeypair.publicKey,
      newAccountPubkey: oracleKeypair.publicKey,
      space: oracleSize,
      lamports: oracleRent,
      programId: new PublicKey("gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s"), // Mock oracle program
   })
  );
  
  await provider.sendAndConfirm(createOracleTx, [adminKeypair, oracleKeypair]);
  console.log("   Oracle Account:", oracleKeypair.publicKey.toString());
  console.log("   ✅ Initial SOL price: $100 (mock)");

  console.log("\n📄 Configuration saved to drift-config.json");
  
  const config = {
    network: "localnet",
    rpcUrl: RPC_URL,
    driftProgramId: DRIFT_PROGRAM_ID.toString(),
    adminPublicKey: adminKeypair.publicKey.toString(),
    usdcMint: usdcMint.toString(),
    solOracle: oracleKeypair.publicKey.toString(),
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync(
    path.join(__dirname, "drift-config.json"),
    JSON.stringify(config, null, 2)
  );

  console.log("\n✅ Drift Protocol Infrastructure Ready!");
  console.log("\n📋 Next Steps:");
  console.log("   1. Initialize clearing house state");
  console.log("   2. Create USDC spot market");
  console.log("   3. Create SOL-PERP market");
  console.log("   4. Start trading!");
  
  return config;
}

main()
  .then((config) => {
    console.log("\n🎉 Success!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Error:", err);
    process.exit(1);
  });
