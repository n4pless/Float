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
const RPC_URL = process.env.RPC_URL || 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
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

  // 1. Crank the prelaunch oracle keeper instruction to update lastUpdateSlot.
  //    Without this, the oracle appears infinitely stale (lastUpdateSlot=0) and
  //    the Drift program refuses AMM fills in placeAndTakePerpOrder.
  //    This also sets price from AMM TWAP, which we overwrite in step 2.
  let slotTx;
  try {
    slotTx = await adminClient.updatePrelaunchOracle(PERP_MARKET_INDEX);
  } catch (err) {
    slotTx = 'slot-err-' + (err.message?.slice(0, 20) || 'unknown');
  }

  // 2. Update the Prelaunch Oracle price with the real Binance price
  //    (overwrites the AMM TWAP price set in step 1, keeps lastUpdateSlot)
  const oracleTx = await adminClient.updatePrelaunchOracleParams(
    PERP_MARKET_INDEX,
    priceBN,
    maxPriceBN,
  );

  // 3. Wait for the polling subscriber to pick up the new oracle price
  //    (repegAmmCurve requires the on-chain oracle to already reflect the new price)
  await sleep(2000);
  try { await adminClient.accountSubscriber.fetch(); } catch {}

  // 4. Re-peg the AMM so mark price matches oracle
  //    PEG_PRECISION = 1e6, so pegMultiplier = price * 1e6
  const pegMultiplier = new BN(Math.round(price * 1e6));
  let pegTx;
  try {
    pegTx = await adminClient.repegAmmCurve(pegMultiplier, PERP_MARKET_INDEX);
  } catch (err) {
    // Non-fatal — oracle price is the primary display source
    pegTx = 'skip-' + (err.message?.slice(0, 30) || 'unknown');
  }

  return { oracleTx, pegTx, slotTx };
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
    AdminClient, OracleSource,
    initialize: sdkInit, PRICE_PRECISION, getPrelaunchOraclePublicKey,
  } = sdk;

  sdkInit({ env: 'devnet' });

  const prelaunchOracle = getPrelaunchOraclePublicKey(PROGRAM_ID, PERP_MARKET_INDEX);
  console.log(`[ok] Oracle PDA: ${prelaunchOracle.toString()}`);

  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
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

      // 1. Set the real price first (also resets bid/ask TWAPs with our program fix)
      const priceBN = new BN(Math.round(price * 1e6));
      const maxPriceBN = sdk.PRICE_PRECISION.mul(new BN(100000));
      const oracleTx = await adminClient.updatePrelaunchOracleParams(
        PERP_MARKET_INDEX, priceBN, maxPriceBN,
      );

      // 2. Crank the prelaunch oracle to refresh lastUpdateSlot and recalculate confidence
      //    Done AFTER setting price so confidence uses the freshly-reset bid/ask TWAPs
      let slotTx;
      try {
        slotTx = await adminClient.updatePrelaunchOracle(PERP_MARKET_INDEX);
      } catch (err) {
        slotTx = 'slot-err-' + (err.message?.slice(0, 20) || 'unknown');
      }

      // 3. Re-set price after crank (crank overwrites price with AMM TWAP)
      try {
        await adminClient.updatePrelaunchOracleParams(
          PERP_MARKET_INDEX, priceBN, maxPriceBN,
        );
      } catch {}

      // 4. Reset oracle TWAP to keep it aligned with mark TWAP
      let resetTx = 'skip';
      try {
        resetTx = await adminClient.resetPerpMarketAmmOracleTwap(PERP_MARKET_INDEX);
        resetTx = typeof resetTx === 'string' ? resetTx.slice(0, 8) : 'ok';
      } catch (err) {
        resetTx = 'skip-' + (err.message?.slice(0, 20) || 'unknown');
      }

      // 5. ALWAYS repeg AMM to adjust peg multiplier toward oracle price
      let pegTx = 'skip';
      {
        await sleep(2000);
        try { await adminClient.accountSubscriber.fetch(); } catch {}
        const pegMultiplier = new BN(Math.round(price * 1e6));
        try {
          pegTx = await adminClient.repegAmmCurve(pegMultiplier, PERP_MARKET_INDEX);
        } catch (err) {
          pegTx = 'skip-' + (err.message?.slice(0, 30) || 'unknown');
        }
      }

      // 6. Call updateAMMs to trigger _update_amm → update_oracle_price_twap
      //    This is the ONLY code path that decays lastOracleConfPct and updates spreads.
      //    repegAmmCurve does NOT call _update_amm.
      //    IMPORTANT: Prelaunch oracle must be passed as WRITABLE because its update()
      //    method mutates the oracle account during price reads.
      let ammTx = 'skip';
      try {
        const { Transaction: Tx, ComputeBudgetProgram: CBP } = await import('@solana/web3.js');
        const perpMarket = adminClient.getPerpMarketAccount(PERP_MARKET_INDEX);
        const statePublicKey = await adminClient.getStatePublicKey();
        const ammIx = await adminClient.program.instruction.updateAmms([PERP_MARKET_INDEX], {
          accounts: { state: statePublicKey, authority: adminClient.wallet.publicKey },
          remainingAccounts: [
            { pubkey: perpMarket.amm.oracle, isWritable: true, isSigner: false },
            { pubkey: perpMarket.pubkey, isWritable: true, isSigner: false },
          ],
        });
        const cuIx = CBP.setComputeUnitLimit({ units: 400000 });
        const tx = new Tx().add(cuIx).add(ammIx);
        tx.feePayer = adminClient.wallet.publicKey;
        const bh = await connection.getLatestBlockhash();
        tx.recentBlockhash = bh.blockhash;
        const adminKp = loadKeypair(ADMIN_KEYPAIR_PATH);
        tx.sign(adminKp);
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, 'confirmed');
        ammTx = typeof sig === 'string' ? sig.slice(0, 8) : 'ok';
      } catch (err) {
        ammTx = 'skip-' + (err.message?.slice(0, 20) || 'unknown');
      }

      updateCount++;
      lastLoggedPrice = price;
      const ts = new Date().toISOString().slice(11, 19);
      const slotStr = typeof slotTx === 'string' ? slotTx.slice(0, 8) : 'ok';
      console.log(`[${ts}] $${price.toFixed(2)} (${source}) | oracle=${oracleTx.slice(0, 8)}.. slot=${slotStr}.. reset=${resetTx}.. peg=${pegTx.slice(0, 8)}.. amm=${ammTx}.. | #${updateCount}`);
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
      console.log(`[ok] Finished. ${updateCount} updates, ${errorCount} errors.`);
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } else {
    await adminClient.unsubscribe();
    console.log('[ok] Done (one-shot mode).');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
