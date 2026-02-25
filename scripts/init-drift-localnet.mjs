/**
 * Initialize Drift Protocol on Localnet
 *
 * Uses the official @drift-labs/sdk AdminClient to:
 * 1. Initialize clearing house (State account)
 * 2. Create USDC spot market (index 0) — collateral
 * 3. Create SOL-PERP market (index 0)
 *
 * Run from repo root:
 *   node scripts/init-drift-localnet.mjs
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync } from '@solana/spl-token';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FRONTEND = path.resolve(ROOT, 'frontend');

// ─── Constants ──────────────────────────────────────────────────────────────────
const RPC_URL = 'http://localhost:8899';
const DRIFT_PROGRAM_ID = new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH');

// ─── Helpers ────────────────────────────────────────────────────────────────────
function loadKeypair(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  DRIFT LOCALNET INITIALIZATION (via SDK AdminClient)');
  console.log('='.repeat(70) + '\n');

  // 1. Connect to local validator
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    const version = await connection.getVersion();
    console.log(`[ok] Connected to validator: Solana ${version['solana-core']}`);
  } catch {
    console.error('[!!] Cannot connect to localhost:8899. Is solana-test-validator running?');
    process.exit(1);
  }

  // 2. Load admin keypair
  const adminPath = path.join(ROOT, 'keys', 'admin-keypair.json');
  if (!fs.existsSync(adminPath)) {
    console.error(`[!!] Admin keypair not found at ${adminPath}`);
    process.exit(1);
  }
  const adminKeypair = loadKeypair(adminPath);
  const wallet = new Wallet(adminKeypair);
  console.log(`[ok] Admin: ${adminKeypair.publicKey.toString()}`);

  // 3. Airdrop SOL if needed
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 10 * LAMPORTS_PER_SOL) {
    console.log('[..] Requesting airdrop (100 SOL)...');
    const sig = await connection.requestAirdrop(adminKeypair.publicKey, 100 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('[ok] Airdrop confirmed');
  } else {
    console.log(`[ok] Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  }

  // 4. Create USDC mint (or reuse existing)
  const configPath = path.join(ROOT, 'drift-config.json');
  let existingConfig = {};
  if (fs.existsSync(configPath)) {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  let usdcMint;
  if (existingConfig.usdcMint) {
    const pubkey = new PublicKey(existingConfig.usdcMint);
    const acct = await connection.getAccountInfo(pubkey);
    if (acct) {
      usdcMint = pubkey;
      console.log(`[ok] Reusing USDC mint: ${usdcMint.toString()}`);
    }
  }
  if (!usdcMint) {
    console.log('[..] Creating USDC mint...');
    usdcMint = await createMint(connection, adminKeypair, adminKeypair.publicKey, null, 6);
    console.log(`[ok] USDC mint: ${usdcMint.toString()}`);

    // Mint 10M USDC to admin
    const ata = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, adminKeypair.publicKey);
    await mintTo(connection, adminKeypair, usdcMint, ata.address, adminKeypair, 10_000_000 * 1e6);
    console.log('[ok] Minted 10,000,000 USDC to admin');
  }

  // 5. Import Drift SDK (dynamic import for ESM)
  console.log('[..] Loading Drift SDK...');
  const sdk = await import('@drift-labs/sdk');
  const { AdminClient, BulkAccountLoader, OracleSource, initialize: sdkInit, PRICE_PRECISION, PEG_PRECISION, BASE_PRECISION, QUOTE_PRECISION } = sdk;

  // Initialize SDK config — use devnet env but override the program ID
  sdkInit({ env: 'devnet', overrideEnv: { DRIFT_PROGRAM_ID: DRIFT_PROGRAM_ID.toString() } });

  const bulkAccountLoader = new BulkAccountLoader(connection, 'confirmed', 1000);
  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed', preflightCommitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [],
    spotMarketIndexes: [],
    oracleInfos: [],
    accountSubscription: { type: 'polling', accountLoader: bulkAccountLoader },
    txVersion: 'legacy',
  });

  // 6. Check if State already exists
  let needsInit = true;
  try {
    await adminClient.subscribe();
    const state = adminClient.getStateAccount();
    if (state) {
      console.log('[ok] Drift State already initialized');
      needsInit = false;
    }
  } catch (e) {
    console.log('[..] State not found — will initialize');
    needsInit = true;
  }

  // 7. Initialize Drift if needed
  if (needsInit) {
    console.log('[..] Initializing Drift Protocol (State)...');
    try {
      const txSig = await adminClient.initialize(usdcMint, true);
      console.log(`[ok] Drift initialized! Tx: ${txSig}`);
      await sleep(2000);
      // Re-subscribe after init
      try { await adminClient.unsubscribe(); } catch {}
      await adminClient.subscribe();
    } catch (err) {
      if (err.message?.includes('already in use')) {
        console.log('[ok] State already initialized (account exists)');
        try { await adminClient.unsubscribe(); } catch {}
        await adminClient.subscribe();
      } else {
        console.error('[!!] Initialize failed:', err.message || err);
        throw err;
      }
    }
  }

  // 8. Create USDC Spot Market (Index 0) if it doesn't exist
  let spotMarketExists = false;
  try {
    const spotMarket = adminClient.getSpotMarketAccount(0);
    if (spotMarket) {
      spotMarketExists = true;
      console.log('[ok] USDC spot market (index 0) already exists');
    }
  } catch {}

  if (!spotMarketExists) {
    console.log('[..] Creating USDC spot market (index 0)...');
    try {
      const txSig = await adminClient.initializeSpotMarket(
        usdcMint,
        8000,  // optimalUtilization 80%
        1000,  // optimalRate 10%
        5000,  // maxRate 50%
        PublicKey.default,          // oracle (none for USDC)
        OracleSource.QUOTE_ASSET,   // oracle source
        10000, // initialAssetWeight 100%
        10000, // maintenanceAssetWeight 100%
        10000, // initialLiabilityWeight 100%
        10000, // maintenanceLiabilityWeight 100%
        0,     // imfFactor
        0,     // liquidatorFee
        0,     // ifLiquidationFee
        true,  // activeStatus
        { collateral: {} }, // assetTier
      );
      console.log(`[ok] USDC spot market created! Tx: ${txSig}`);
      await sleep(2000);
    } catch (err) {
      if (err.message?.includes('already in use')) {
        console.log('[ok] USDC spot market already exists');
      } else {
        console.error('[!!] Failed to create USDC spot market:', err.message || err);
        console.error('     Full error:', err);
      }
    }
  }

  // 9. Set up oracle for SOL price using mock Pyth program
  const PYTH_PROGRAM_ID = new PublicKey('FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH');
  let oraclePublicKey;

  if (existingConfig.solOracle && existingConfig.solOracle !== PublicKey.default.toString()) {
    const pubkey = new PublicKey(existingConfig.solOracle);
    const acct = await connection.getAccountInfo(pubkey);
    if (acct) {
      oraclePublicKey = pubkey;
      console.log(`[ok] Reusing SOL oracle: ${oraclePublicKey.toString()}`);
    }
  }

  let oracleSource = OracleSource.PYTH;
  if (!oraclePublicKey) {
    console.log('[..] Creating mock Pyth oracle for SOL ($178)...');
    try {
      // Load the mock Pyth IDL
      const pythIdlPath = path.resolve(ROOT, 'protocol-v2/sdk/src/idl/pyth.json');
      const pythIDL = JSON.parse(fs.readFileSync(pythIdlPath, 'utf-8'));

      // Create Anchor provider and program for the mock Pyth
      const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
      });
      const pythProgram = new anchor.Program(pythIDL, PYTH_PROGRAM_ID, provider);

      // Create a new account for the price feed
      const priceFeedKeypair = Keypair.generate();
      const price = 178;
      const expo = -4;
      const conf = new BN(Math.floor(price / 10) * (10 ** (-expo)));
      const initPrice = new BN(price * (10 ** (-expo)));

      const space = 3312; // Pyth price account size
      const lamports = await connection.getMinimumBalanceForRentExemption(space);

      const txSig = await pythProgram.rpc.initialize(
        initPrice,
        expo,
        conf,
        {
          accounts: { price: priceFeedKeypair.publicKey },
          signers: [priceFeedKeypair],
          instructions: [
            anchor.web3.SystemProgram.createAccount({
              fromPubkey: adminKeypair.publicKey,
              newAccountPubkey: priceFeedKeypair.publicKey,
              space,
              lamports,
              programId: PYTH_PROGRAM_ID,
            }),
          ],
        }
      );
      oraclePublicKey = priceFeedKeypair.publicKey;
      console.log(`[ok] Mock oracle created at: ${oraclePublicKey.toString()}`);
      console.log(`     Tx: ${txSig}`);
      await sleep(2000);
    } catch (err) {
      console.error('[!!] Failed to create mock oracle:', err.message || err);
      throw err;
    }
  }

  // 10. Create SOL-PERP market (Index 0)
  let perpMarketExists = false;
  try {
    const perpMarket = adminClient.getPerpMarketAccount(0);
    if (perpMarket) {
      perpMarketExists = true;
      console.log('[ok] SOL-PERP market (index 0) already exists');
    }
  } catch {}

  if (!perpMarketExists) {
    console.log('[..] Creating SOL-PERP market (index 0)...');
    try {
      // Price = pegMultiplier / PRICE_PRECISION * (quoteReserve / baseReserve)
      // We want initial price ≈ $178 (spot price). With equal reserves and peg = 178 * PEG_PRECISION:
      const ammBaseReserve = new BN(1_000).mul(BASE_PRECISION);
      const ammQuoteReserve = new BN(1_000).mul(BASE_PRECISION);
      const ammPeriodicity = new BN(3600); // 1hr funding period
      const pegMultiplier = new BN(178).mul(PEG_PRECISION); // ~$178

      const txSig = await adminClient.initializePerpMarket(
        0,                   // marketIndex
        oraclePublicKey,     // priceOracle
        ammBaseReserve,      // baseAssetReserve
        ammQuoteReserve,     // quoteAssetReserve
        ammPeriodicity,      // periodicity
        pegMultiplier,       // pegMultiplier
        oracleSource,        // oracleSource
        undefined,           // contractTier (default)
        1000,                // marginRatioInitial (10x, 10%)
        500,                 // marginRatioMaintenance (5%)
        100,                 // liquidatorFee (0.01 = 1%)
        100,                 // ifLiquidatorFee
        0,                   // imfFactor
        true,                // activeStatus
        100,                 // baseSpread (0.01%)
        10000,               // maxSpread (1%)
        undefined,           // maxOpenInterest
        undefined,           // maxRevenueWithdrawPerPeriod
        undefined,           // quoteMaxInsurance
        new BN(1_000_000),   // orderStepSize (0.001 SOL)
        new BN(100),         // orderTickSize
        new BN(1_000_000),   // minOrderSize (0.001 SOL)
        undefined,           // concentrationCoefScale
        100,                 // curveUpdateIntensity
        0,                   // ammJitIntensity
        'SOL-PERP',          // name
      );
      console.log(`[ok] SOL-PERP market created! Tx: ${txSig}`);
      await sleep(2000);
    } catch (err) {
      if (err.message?.includes('already in use')) {
        console.log('[ok] SOL-PERP market already exists');
      } else {
        console.error('[!!] Failed to create SOL-PERP:', err.message || err);
        console.error('     Full error:', JSON.stringify(err, null, 2));
      }
    }
  }

  // 11. Re-subscribe to pick up new markets
  try { await adminClient.unsubscribe(); } catch {}

  const adminClient2 = new AdminClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: { type: 'polling', accountLoader: bulkAccountLoader },
    txVersion: 'legacy',
  });

  try {
    await adminClient2.subscribe();

    // Verify state
    const state = adminClient2.getStateAccount();
    console.log('\n' + '='.repeat(70));
    console.log('  VERIFICATION');
    console.log('='.repeat(70));
    console.log(`[ok] State account found`);
    console.log(`     numberOfSpotMarkets: ${state.numberOfSpotMarkets}`);
    console.log(`     numberOfMarkets: ${state.numberOfMarkets}`);

    try {
      const spotMarket = adminClient2.getSpotMarketAccount(0);
      console.log(`[ok] USDC Spot Market: mint=${spotMarket.mint.toString()}`);
    } catch {
      console.log('[!!] USDC Spot Market not found');
    }

    try {
      const perpMarket = adminClient2.getPerpMarketAccount(0);
      console.log(`[ok] SOL-PERP Market: marketIndex=${perpMarket.marketIndex}, status=${JSON.stringify(perpMarket.status)}`);

      // Get mark price from AMM
      const pegNum = perpMarket.amm.pegMultiplier.toNumber();
      const pegPrecision = PEG_PRECISION.toNumber();
      console.log(`     AMM peg: ${pegNum / pegPrecision}`);
    } catch {
      console.log('[!!] SOL-PERP Market not found');
    }

    // 11b. Seed vault — admin deposits 1M USDC so user withdrawals work
    console.log('[..] Seeding spot market vault with 1M USDC...');
    try {
      // Check if admin user account exists
      let needsInit = false;
      try {
        const userPda = await adminClient2.getUserAccountPublicKey();
        const info = await connection.getAccountInfo(userPda);
        if (!info || info.data.length === 0) needsInit = true;
      } catch { needsInit = true; }

      if (needsInit) {
        const [initTx] = await adminClient2.initializeUserAccount(0, 'vault-seed');
        console.log(`[ok] Admin user account created: ${initTx}`);
        await sleep(2000);
      }

      // Mint 1M USDC to admin and deposit
      const adminAta = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, adminKeypair.publicKey);
      await mintTo(connection, adminKeypair, usdcMint, adminAta.address, adminKeypair, 1_000_000 * 1e6);
      const userTokenAccount = getAssociatedTokenAddressSync(usdcMint, adminKeypair.publicKey);
      const depositTx = await adminClient2.deposit(new BN(1_000_000 * 1e6), 0, userTokenAccount);
      console.log(`[ok] Vault seeded with 1,000,000 USDC: ${depositTx}`);
    } catch (err) {
      console.warn('[warn] Vault seeding failed (non-fatal):', err.message);
    }

    await adminClient2.unsubscribe();
  } catch (err) {
    console.error('[!!] Verification failed:', err.message);
  }

  // 12. Save config
  const finalConfig = {
    network: 'localnet',
    rpcUrl: RPC_URL,
    driftProgramId: DRIFT_PROGRAM_ID.toString(),
    adminPublicKey: adminKeypair.publicKey.toString(),
    usdcMint: usdcMint.toString(),
    solOracle: oraclePublicKey.toString(),
    initialized: true,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
  console.log(`\n[ok] Saved config to ${configPath}`);

  console.log('\n' + '='.repeat(70));
  console.log('  DONE — Drift Protocol is ready on localnet!');
  console.log('='.repeat(70) + '\n');

  // Cleanup
  bulkAccountLoader.stopPolling?.();
  process.exit(0);
}

main().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
