/**
 * Initialize Drift Protocol on Devnet
 *
 * Uses the official @drift-labs/sdk AdminClient to:
 * 1. Initialize clearing house (State account)
 * 2. Create USDC spot market (index 0) — collateral
 * 3. Create SOL-PERP market (index 0) with real Pyth devnet oracle
 * 4. Seed vault with admin USDC liquidity
 *
 * Run from repo root:
 *   node scripts/init-drift-devnet.mjs
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

// ─── Devnet Constants ───────────────────────────────────────────────────────────
const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const DRIFT_PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');

// Real Pyth devnet SOL/USD price feed
const PYTH_SOL_USD_DEVNET = new PublicKey('J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix');

// ─── Helpers ────────────────────────────────────────────────────────────────────
function loadKeypair(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Request SOL airdrop on devnet (max ~2 SOL per call, rate-limited).
 * Retries on failure.
 */
async function safeAirdrop(connection, pubkey, lamports, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const sig = await connection.requestAirdrop(pubkey, lamports);
      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`     Airdrop attempt ${i + 1} failed, retrying in 15s...`);
      await sleep(15000);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('  DRIFT DEVNET INITIALIZATION');
  console.log('  Program: ' + DRIFT_PROGRAM_ID.toString());
  console.log('='.repeat(70) + '\n');

  // 1. Connect to devnet
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    const version = await connection.getVersion();
    console.log(`[ok] Connected to Solana devnet: ${version['solana-core']}`);
  } catch {
    console.error('[!!] Cannot connect to devnet RPC');
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

  // 3. Ensure admin has SOL (devnet airdrop: max 2 SOL per request)
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`[ok] Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log('[..] Requesting devnet airdrop (2 SOL)...');
    await safeAirdrop(connection, adminKeypair.publicKey, 2 * LAMPORTS_PER_SOL);
    const newBal = await connection.getBalance(adminKeypair.publicKey);
    console.log(`[ok] New balance: ${(newBal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  }

  // 4. Verify Pyth SOL/USD oracle exists on devnet
  console.log(`[..] Checking Pyth SOL/USD oracle: ${PYTH_SOL_USD_DEVNET.toString()}`);
  const oracleAcct = await connection.getAccountInfo(PYTH_SOL_USD_DEVNET);
  if (!oracleAcct) {
    console.error('[!!] Pyth SOL/USD oracle not found on devnet!');
    console.error('     Expected: J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix');
    console.error('     This oracle account must exist for SOL-PERP market creation.');
    process.exit(1);
  }
  console.log(`[ok] Pyth oracle found (${oracleAcct.data.length} bytes, owner: ${oracleAcct.owner.toString()})`);

  // 5. Create USDC mint (or reuse existing)
  const configPath = path.join(ROOT, 'drift-config.json');
  let existingConfig = {};
  if (fs.existsSync(configPath)) {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  let usdcMint;
  // Only reuse if the existing config is also devnet and has a valid mint
  if (existingConfig.network === 'devnet' && existingConfig.usdcMint
      && !existingConfig.usdcMint.includes('PLACEHOLDER')) {
    try {
      const pubkey = new PublicKey(existingConfig.usdcMint);
      const acct = await connection.getAccountInfo(pubkey);
      if (acct) {
        usdcMint = pubkey;
        console.log(`[ok] Reusing USDC mint: ${usdcMint.toString()}`);
      }
    } catch {
      // Invalid key in config, will create new
    }
  }
  if (!usdcMint) {
    console.log('[..] Creating USDC mint on devnet...');
    usdcMint = await createMint(connection, adminKeypair, adminKeypair.publicKey, null, 6);
    console.log(`[ok] USDC mint: ${usdcMint.toString()}`);

    // Mint 10M USDC to admin
    const ata = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, adminKeypair.publicKey);
    await mintTo(connection, adminKeypair, usdcMint, ata.address, adminKeypair, 10_000_000 * 1e6);
    console.log('[ok] Minted 10,000,000 USDC to admin');
  }

  // 6. Import Drift SDK
  console.log('[..] Loading Drift SDK...');
  const sdk = await import('@drift-labs/sdk');
  const { AdminClient, BulkAccountLoader, OracleSource, initialize: sdkInit, PRICE_PRECISION, PEG_PRECISION, BASE_PRECISION, QUOTE_PRECISION, getPrelaunchOraclePublicKey } = sdk;

  // Initialize SDK config — devnet env with our custom program ID
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

  // 7. Check if State already exists
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

  // 8. Initialize Drift if needed
  if (needsInit) {
    console.log('[..] Initializing Drift Protocol (State)...');
    try {
      const txSig = await adminClient.initialize(usdcMint, true);
      console.log(`[ok] Drift initialized! Tx: ${txSig}`);
      await sleep(2000);
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

  // 9. Create USDC Spot Market (Index 0)
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

  // 10. Create SOL-PERP market (Index 0) using Prelaunch oracle
  // Real Pyth push oracles (V1) are deprecated on devnet.
  // We use a Prelaunch oracle managed by our own program.
  const perpMarketIndex = 0;
  const prelaunchOraclePublicKey = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, perpMarketIndex);
  const oracleSource = OracleSource.Prelaunch;

  // First, initialize the prelaunch oracle
  let prelaunchOracleExists = false;
  try {
    const oracleAcctInfo = await connection.getAccountInfo(prelaunchOraclePublicKey);
    if (oracleAcctInfo && oracleAcctInfo.data.length > 0) {
      prelaunchOracleExists = true;
      console.log(`[ok] Prelaunch oracle already exists: ${prelaunchOraclePublicKey.toString()}`);
    }
  } catch {}

  if (!prelaunchOracleExists) {
    console.log('[..] Creating Prelaunch oracle for SOL-PERP (index 0)...');
    try {
      const solPrice = new BN(180).mul(PRICE_PRECISION); // ~$180
      const maxPrice = new BN(1000).mul(PRICE_PRECISION); // max $1000
      const txSig = await adminClient.initializePrelaunchOracle(perpMarketIndex, solPrice, maxPrice);
      console.log(`[ok] Prelaunch oracle created! Tx: ${txSig}`);
      console.log(`     Oracle PDA: ${prelaunchOraclePublicKey.toString()}`);
      await sleep(2000);
    } catch (err) {
      if (err.message?.includes('already in use')) {
        console.log('[ok] Prelaunch oracle already exists');
      } else {
        console.error('[!!] Failed to create prelaunch oracle:', err.message || err);
      }
    }
  }

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
    console.log(`     Oracle: ${prelaunchOraclePublicKey.toString()} (Prelaunch, ~$180)`);
    try {
      // Price ≈ current SOL price from oracle. Set AMM peg to ~$180.
      const ammBaseReserve = new BN(1_000).mul(BASE_PRECISION);
      const ammQuoteReserve = new BN(1_000).mul(BASE_PRECISION);
      const ammPeriodicity = new BN(3600); // 1hr funding period
      const pegMultiplier = new BN(180).mul(PEG_PRECISION); // ~$180

      const txSig = await adminClient.initializePerpMarket(
        0,                           // marketIndex
        prelaunchOraclePublicKey,     // priceOracle (Prelaunch oracle PDA)
        ammBaseReserve,              // baseAssetReserve
        ammQuoteReserve,             // quoteAssetReserve
        ammPeriodicity,              // periodicity
        pegMultiplier,               // pegMultiplier
        oracleSource,                // oracleSource = Prelaunch
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

  // 11. Re-subscribe to pick up new markets and verify
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
      const pegNum = perpMarket.amm.pegMultiplier.toNumber();
      const pegPrecision = PEG_PRECISION.toNumber();
      console.log(`     AMM peg: ${pegNum / pegPrecision}`);
    } catch {
      console.log('[!!] SOL-PERP Market not found');
    }

    // 12. Seed vault with admin USDC
    console.log('[..] Seeding spot market vault with 1M USDC...');
    try {
      let vaultNeedsInit = false;
      try {
        const userPda = await adminClient2.getUserAccountPublicKey();
        const info = await connection.getAccountInfo(userPda);
        if (!info || info.data.length === 0) vaultNeedsInit = true;
      } catch { vaultNeedsInit = true; }

      if (vaultNeedsInit) {
        const [initTx] = await adminClient2.initializeUserAccount(0, 'vault-seed');
        console.log(`[ok] Admin user account created: ${initTx}`);
        await sleep(2000);
      }

      // Mint and deposit 1M USDC
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

  // 13. Save config to drift-config.json
  const finalConfig = {
    network: 'devnet',
    rpcUrl: RPC_URL,
    driftProgramId: DRIFT_PROGRAM_ID.toString(),
    adminPublicKey: adminKeypair.publicKey.toString(),
    usdcMint: usdcMint.toString(),
    solOracle: prelaunchOraclePublicKey.toString(),
    initialized: true,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
  console.log(`\n[ok] Saved config to ${configPath}`);

  // 14. Auto-update frontend config.ts with new addresses
  const frontendConfigPath = path.join(FRONTEND, 'src', 'config.ts');
  if (fs.existsSync(frontendConfigPath)) {
    let configTs = fs.readFileSync(frontendConfigPath, 'utf-8');
    // Replace values using regex
    configTs = configTs.replace(/(rpc:\s*')([^']+)(')/,         `$1${RPC_URL}$3`);
    configTs = configTs.replace(/(network:\s*')([^']+)(')/,     `$1devnet$3`);
    configTs = configTs.replace(/(driftProgram:\s*')([^']+)(')/, `$1${DRIFT_PROGRAM_ID.toString()}$3`);
    configTs = configTs.replace(/(mint:\s*')([^']+)(')/,         `$1${usdcMint.toString()}$3`);
    configTs = configTs.replace(/(solOracle:\s*')([^']+)(')/,    `$1${prelaunchOraclePublicKey.toString()}$3`);
    fs.writeFileSync(frontendConfigPath, configTs);
    console.log(`[ok] Updated ${frontendConfigPath}`);
  }

  // 15. Auto-update vite.config.ts with new addresses
  const viteConfigPath = path.join(FRONTEND, 'vite.config.ts');
  if (fs.existsSync(viteConfigPath)) {
    let viteCfg = fs.readFileSync(viteConfigPath, 'utf-8');
    // Replace RPC URL and USDC mint in faucet plugin
    viteCfg = viteCfg.replace(
      /new Connection\('http:\/\/localhost:8899'/g,
      `new Connection('${RPC_URL}'`
    );
    viteCfg = viteCfg.replace(
      /const usdcMint = new PublicKey\('[^']+'\)/,
      `const usdcMint = new PublicKey('${usdcMint.toString()}')`
    );
    // Update the comment
    viteCfg = viteCfg.replace('Localnet faucet', 'Devnet faucet');
    fs.writeFileSync(viteConfigPath, viteCfg);
    console.log(`[ok] Updated ${viteConfigPath}`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('  DONE — Drift Protocol is ready on Solana Devnet!');
  console.log('='.repeat(70));
  console.log(`  Program:   ${DRIFT_PROGRAM_ID.toString()}`);
  console.log(`  USDC Mint: ${usdcMint.toString()}`);
  console.log(`  Oracle:    ${prelaunchOraclePublicKey.toString()} (Prelaunch)`);
  console.log(`  Admin:     ${adminKeypair.publicKey.toString()}`);
  console.log('='.repeat(70) + '\n');

  // Cleanup
  bulkAccountLoader.stopPolling?.();
  process.exit(0);
}

main().catch(err => {
  console.error('\n[FATAL]', err);
  process.exit(1);
});
