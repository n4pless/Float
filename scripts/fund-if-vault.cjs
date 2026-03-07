// Directly fund the IF vault with admin-minted USDC
// This increases the vault balance, making each share more valuable
const anchor = require("@coral-xyz/anchor");
const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { mintTo } = require("@solana/spl-token");
const fs = require("fs");

const RPC = "https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/";
const conn = new Connection(RPC, "confirmed");
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("./keys/admin-keypair.json","utf8"))));
const programId = new PublicKey("EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE");
const USDC_MINT = new PublicKey("4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn");

(async () => {
  const BN = anchor.BN;
  const [ifVaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("insurance_fund_vault"), new BN(0).toArrayLike(Buffer, "le", 2)],
    programId
  );
  console.log("IF vault:", ifVaultPda.toBase58());

  const balBefore = await conn.getTokenAccountBalance(ifVaultPda);
  console.log("Before:", balBefore.value.uiAmountString, "USDC");

  // Mint 50 USDC directly to IF vault
  const amt = 50 * 1e6; // 50 USDC in 6-decimal format
  const sig = await mintTo(conn, kp, USDC_MINT, ifVaultPda, kp, amt);
  console.log("Minted 50 USDC to IF vault, tx:", sig);

  const balAfter = await conn.getTokenAccountBalance(ifVaultPda);
  console.log("After:", balAfter.value.uiAmountString, "USDC");

  // Now also run settle to move revenue pool funds
  const idl = JSON.parse(fs.readFileSync("./protocol-v2/target/idl/drift.json","utf8"));
  const wallet = new anchor.Wallet(kp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, programId, provider);
  const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from("drift_state")], programId);
  const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from("spot_market"), new BN(0).toArrayLike(Buffer, "le", 2)], programId);
  const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from("spot_market_vault"), new BN(0).toArrayLike(Buffer, "le", 2)], programId);
  const [driftSigner] = PublicKey.findProgramAddressSync([Buffer.from("drift_signer")], programId);

  // Run multiple settles to drain more from revenue pool
  for (let i = 0; i < 5; i++) {
    try {
      const tx = await program.rpc.settleRevenueToInsuranceFund(0, {
        accounts: {
          state: statePda,
          spotMarket: spotPda,
          spotMarketVault: spotVaultPda,
          driftSigner: driftSigner,
          insuranceFundVault: ifVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      });
      console.log(`Settle ${i+1}: tx`, tx);
    } catch (e) {
      console.log(`Settle ${i+1}: ${e.message.slice(0, 100)}`);
    }
  }

  const balFinal = await conn.getTokenAccountBalance(ifVaultPda);
  console.log("\nFinal IF vault:", balFinal.value.uiAmountString, "USDC");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
