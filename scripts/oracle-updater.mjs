/**
 * Float Exchange — Oracle Price Auto-Updater
 *
 * Continuously fetches the real SOL/USD price and updates the on-chain
 * Prelaunch oracle + AMM peg on the localnet Drift deployment.
 *
 * Designed to run as a long-lived pm2 process (float-oracle).
 *
 * Usage:
 *   node scripts/oracle-updater.mjs                  # one-shot
 *   node scripts/oracle-updater.mjs --loop            # continuous (default 10s)
 *   node scripts/oracle-updater.mjs --loop --interval 5000   # custom interval
 *
 * Environment variables (all optional, with sensible defaults):
 *   RPC_URL          — Solana RPC (default: http://127.0.0.1:8899)
 *   DRIFT_PROGRAM_ID — Drift program pubkey
 *   ADMIN_KEYPAIR    — Path to admin keypair JSON
 *   UPDATE_INTERVAL  — Milliseconds between updates (default: 10000)
 *   PRICE_THRESHOLD  — Min % change to trigger on-chain update (default: 0.1)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Configuration ──────────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8899';
const PROGRAM_ID = new PublicKey(
  process.env.DRIFT_PROGRAM_ID || 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE'
);
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR || path.join(ROOT, 'keys', 'admin-keypair.json');
const PERP_MARKET_INDEX = 0;

// Parse --interval flag or env
const intervalArg = process.argv.findIndex(a => a === '--interval');
const UPDATE_INTERVAL = parseInt(
  intervalArg > -1 ? process.argv[intervalArg + 1] : (process.env.UPDATE_INTERVAL || '10000')
);
const LOOP_MODE = process.argv.includes('--loop');

// Minimum % price change to send an on-chain tx (avoids spam when price is flat)
const PRICE_THRESHOLD = parseFloat(process.env.PRICE_THRESHOLD || '0.1');

// ─── Helpers ────────────────────────────────────────────────────────────────────
function loadKeypair(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let lastLoggedPrice = 0;
let updateCount = 0;
let errorCount = 0;

// ─── Price Fetching (triple fallback) ───────────────────────────────────────────
async function fetchSolPrice() {
  const sources = [
    {
      name: 'Binance',
      url: 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      extract: (d) => parseFloat(d.price),
    },
    {
      name: 'CoinGecko',
      url: 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      extract: (d) => d.solana?.usd,
    },
    {
      name: 'CryptoCompare',
      url: 'https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD',
      extract: (d) => d.USD,
    },
  ];

  for (const src of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(src.url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const price = src.extract(data);
      if (price && price > 0) return { price, source: src.name };
    } catch {}
  }
  throw new Error('All price sources failed');
}

// ─── Oracle + AMM Update ────────────────────────────────────────────────────────
async function updateOracleAndAmm(adminClient, sdk, price) {
  const { PRICE_PRECISION } = sdk;

  // PRICE_PRECISION = PEG_PRECISION = 1e6 in this SDK version
  const priceBN = new BN(Math.round(price * 1e6));
  const maxPriceBN = PRICE_PRECISION.mul(new BN(100000)); // $100k max

  // 1. Update the Prelaunch Oracle price
  const oracleTx = await adminClient.updatePrelaunchOracleParams(
    PERP_MARKET_INDEX,
    priceBN,
    maxPriceBN,
  );

  // 2. Wait for the polling subscriber to pick up the new oracle price
  //    (repegAmmCurve requires the on-chain oracle to already reflect the new price)
  await sleep(2000);
  try { await adminClient.accountSubscriber.fetch(); } catch {}

  // 3. Re-peg the AMM so mark price matches oracle
  //    PEG_PRECISION = 1e6, so pegMultiplier = price * 1e6
  const pegMultiplier = new BN(Math.round(price * 1e6));
  let pegTx;
  try {
    pegTx = await adminClient.repegAmmCurve(pegMultiplier, PERP_MARKET_INDEX);
  } catch (err) {
    // Non-fatal — oracle price is the primary display source
    pegTx = 'skip-' + (err.message?.slice(0, 30) || 'unknown');
  }

  return { oracleTx, pegTx };
}

// ─── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(60));
  console.log('  FLOAT ORACLE PRICE UPDATER');
  console.log(`  RPC:      ${RPC_URL}`);
  console.log(`  Program:  ${PROGRAM_ID.toString()}`);
  console.log(`  Mode:     ${LOOP_MODE ? `Loop (${UPDATE_INTERVAL / 1000}s)` : 'One-shot'}`);
  console.log(`  Threshold: ${PRICE_THRESHOLD}% change`);
  console.log('='.repeat(60));

  // Load admin
  if (!fs.existsSync(ADMIN_KEYPAIR_PATH)) {
    console.error(`[!!] Admin keypair not found: ${ADMIN_KEYPAIR_PATH}`);
    process.exit(1);
  }
  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);
  const wallet = new Wallet(adminKeypair);
  console.log(`[ok] Admin: ${adminKeypair.publicKey.toString()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    const slot = await connection.getSlot();
    console.log(`[ok] Connected — slot ${slot}`);
  } catch {
    console.error('[!!] Cannot connect to RPC');
    process.exit(1);
  }

  // SDK setup
  const sdk = await import('@drift-labs/sdk');
  const {
    AdminClient, BulkAccountLoader, OracleSource,
    initialize: sdkInit, PRICE_PRECISION, getPrelaunchOraclePublicKey,
  } = sdk;

  sdkInit({ env: 'devnet' });

  const bulkLoader = new BulkAccountLoader(connection, 'confirmed', 5000);
  const prelaunchOracle = getPrelaunchOraclePublicKey(PROGRAM_ID, PERP_MARKET_INDEX);
  console.log(`[ok] Oracle PDA: ${prelaunchOracle.toString()}`);

  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: { type: 'polling', accountLoader: bulkLoader },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: prelaunchOracle, source: OracleSource.Prelaunch }],
    txVersion: 'legacy',
  });

  await adminClient.subscribe();
  console.log('[ok] AdminClient subscribed');

  // Read current on-chain price
  try {
    const oracleData = adminClient.getOracleDataForPerpMarket(PERP_MARKET_INDEX);
    if (oracleData) {
      lastLoggedPrice = oracleData.price.toNumber() / PRICE_PRECISION.toNumber();
      console.log(`[ok] Current on-chain price: $${lastLoggedPrice.toFixed(2)}`);
    }
  } catch {}

  // ─── Update loop ─────────────────────────────────────────────────────────────
  const tick = async () => {
    try {
      const { price, source } = await fetchSolPrice();

      // Check if price changed enough
      if (lastLoggedPrice > 0) {
        const pctChange = Math.abs((price - lastLoggedPrice) / lastLoggedPrice) * 100;
        if (pctChange < PRICE_THRESHOLD) {
          // Price barely moved — skip the on-chain update to save compute
          return;
        }
      }

      const { oracleTx, pegTx } = await updateOracleAndAmm(adminClient, sdk, price);
      updateCount++;
      lastLoggedPrice = price;
      const ts = new Date().toISOString().slice(11, 19);
      console.log(`[${ts}] $${price.toFixed(2)} (${source}) | oracle=${oracleTx.slice(0, 8)}.. peg=${pegTx.slice(0, 8)}.. | #${updateCount}`);
    } catch (err) {
      errorCount++;
      const ts = new Date().toISOString().slice(11, 19);
      console.error(`[${ts}] ERR #${errorCount}: ${err.message?.slice(0, 150)}`);
    }
  };

  // First update always runs
  await tick();

  if (LOOP_MODE) {
    console.log(`[ok] Entering loop — updating every ${UPDATE_INTERVAL / 1000}s\n`);
    // Use setInterval for steady cadence
    const interval = setInterval(tick, UPDATE_INTERVAL);

    // Graceful shutdown
    const shutdown = async () => {
      console.log('\n[..] Shutting down...');
      clearInterval(interval);
      try { await adminClient.unsubscribe(); } catch {}
      bulkLoader.stopPolling?.();
      console.log(`[ok] Finished. ${updateCount} updates, ${errorCount} errors.`);
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    await adminClient.unsubscribe();
    bulkLoader.stopPolling?.();
    console.log('[ok] Done (one-shot mode).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
