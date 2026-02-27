/**
 * Ladder Market Maker — places a full spread of resting limit orders
 * across multiple price levels around the oracle price.
 *
 * Places LEVELS_PER_SIDE bids below oracle and LEVELS_PER_SIDE asks above oracle.
 * Orders use oraclePriceOffset so they float with the oracle automatically.
 * Only cancels/replaces when the oracle moves significantly (> REFRESH_THRESHOLD).
 *
 * Usage:  node ladder-maker.mjs
 * Env:    KEEPER_PRIVATE_KEY, DRIFT_PROGRAM_ID, USDC_MINT (optional)
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  Wallet,
  DriftClient,
  BulkAccountLoader,
  BN,
  BASE_PRECISION,
  PRICE_PRECISION,
  PositionDirection,
  OrderType,
  OrderTriggerCondition,
  PostOnlyParams,
} from '@drift-labs/sdk';
import fs from 'fs';

// ─── CONFIG ────────────────────────────────────────────
const RPC_URL = process.env.ENDPOINT || 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const DRIFT_PROGRAM_ID = new PublicKey(
  process.env.DRIFT_PROGRAM_ID || 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE'
);
const KEYPAIR_PATH =
  process.env.KEEPER_PRIVATE_KEY || '/home/gorcore/Drift-Clone/keys/maker-keypair.json';

const MARKET_INDEX = 0; // SOL-PERP

// Ladder config
const LEVELS_PER_SIDE = 10;          // 10 bids + 10 asks = 20 orders total
const BASE_SIZE_SOL = 0.5;           // base order size in SOL per level
const SIZE_GROWTH = 1.15;            // each level is 15% larger than the previous
const SPREAD_START_BPS = 10;         // tightest level: 10 bps (0.10%) from oracle
const SPREAD_STEP_BPS = 8;           // each additional level adds 8 bps
const REFRESH_INTERVAL_MS = 15_000;  // check every 15s whether orders need refreshing
const REFRESH_THRESHOLD_BPS = 50;    // refresh if oracle has moved >50 bps since last placement

// Inventory management — prevent one-sided accumulation
const MAX_POSITION_SOL = 5.0;        // hard cap: stop adding to a side if position > this
const SKEW_FACTOR = 0.15;            // reduce size by 15% per SOL of inventory on that side
                                      // e.g. if LONG 3 SOL, bids shrink by 45%, asks grow by 45%

// ─── HELPERS ───────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function bpsToFraction(bps) { return bps / 10_000; }

// ─── MAIN ──────────────────────────────────────────────
async function main() {
  console.log('=== Ladder Market Maker ===');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Program: ${DRIFT_PROGRAM_ID.toBase58()}`);
  console.log(`Levels per side: ${LEVELS_PER_SIDE}`);
  console.log(`Spread: ${SPREAD_START_BPS} bps + ${SPREAD_STEP_BPS} bps/level`);

  // Load keypair
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new Wallet(keypair);
  console.log(`Wallet: ${keypair.publicKey.toBase58()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  const accountLoader = new BulkAccountLoader(connection, 'confirmed', 5000);
  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    env: 'devnet',
    activeSubAccountId: 0,
    accountSubscription: { type: 'polling', accountLoader },
  });

  await driftClient.subscribe();
  console.log('DriftClient subscribed');

  // Check balance
  const solBal = (await connection.getBalance(keypair.publicKey)) / 1e9;
  console.log(`SOL balance: ${solBal.toFixed(4)}`);

  let lastOraclePrice = 0;

  // Build the order ladder offsets once
  const ladder = [];
  for (let i = 0; i < LEVELS_PER_SIDE; i++) {
    const spreadBps = SPREAD_START_BPS + i * SPREAD_STEP_BPS;
    const size = BASE_SIZE_SOL * Math.pow(SIZE_GROWTH, i);
    ladder.push({ spreadBps, size });
  }

  console.log('\nLadder levels:');
  ladder.forEach((l, i) =>
    console.log(`  Level ${i}: ±${l.spreadBps} bps, ${l.size.toFixed(4)} SOL`)
  );

  // ─── Place / Refresh loop ───
  async function refreshOrders() {
    try {
      // Get oracle price
      const oracle = driftClient.getOracleDataForPerpMarket(MARKET_INDEX);
      const oracleNum = oracle.price.toNumber() / PRICE_PRECISION.toNumber();

      // Get current position
      const userAcct = driftClient.getUserAccount();
      let positionSol = 0;
      for (const pp of userAcct.perpPositions) {
        if (pp.marketIndex === MARKET_INDEX && !pp.baseAssetAmount.isZero()) {
          positionSol = pp.baseAssetAmount.toNumber() / 1e9;
        }
      }

      // Count existing open orders per side
      const openOrders = userAcct.orders.filter(
        o => 'open' in (o.status) && o.marketIndex === MARKET_INDEX && !o.baseAssetAmount.isZero()
      );
      const bidCount = openOrders.filter(o => 'long' in o.direction).length;
      const askCount = openOrders.filter(o => 'short' in o.direction).length;

      // Decide if we need to refresh
      let needsRefresh = false;
      let reason = '';

      // Always refresh if we're missing orders on either side
      if (bidCount < LEVELS_PER_SIDE || askCount < LEVELS_PER_SIDE) {
        needsRefresh = true;
        reason = `missing orders (bids:${bidCount}/${LEVELS_PER_SIDE} asks:${askCount}/${LEVELS_PER_SIDE})`;
      }

      // Refresh if oracle moved significantly
      if (!needsRefresh && lastOraclePrice > 0) {
        const moveBps = Math.abs(oracleNum - lastOraclePrice) / lastOraclePrice * 10_000;
        if (moveBps >= REFRESH_THRESHOLD_BPS) {
          needsRefresh = true;
          reason = `oracle moved ${moveBps.toFixed(1)} bps`;
        }
      }

      // Always refresh on first run
      if (lastOraclePrice === 0) {
        needsRefresh = true;
        reason = 'initial placement';
      }

      const posDir = positionSol > 0 ? `LONG ${positionSol.toFixed(2)}` :
                     positionSol < 0 ? `SHORT ${Math.abs(positionSol).toFixed(2)}` : 'FLAT';
      console.log(`[${new Date().toISOString().slice(11,19)}] Oracle: $${oracleNum.toFixed(2)} | Pos: ${posDir} SOL | Orders: ${bidCount}B/${askCount}A`);

      if (!needsRefresh) {
        console.log(`  Skipping refresh (no changes needed)`);
        return;
      }
      console.log(`  Refreshing: ${reason}`);

      // Cancel all existing orders
      if (openOrders.length > 0) {
        console.log(`  Cancelling ${openOrders.length} existing orders...`);
        try {
          await driftClient.cancelOrders(undefined, undefined, undefined);
          await sleep(2000);
        } catch (e) {
          console.log(`  Cancel warning: ${e.message || e}`);
        }
      }

      // Inventory skew: reduce size on the side we're already exposed to
      // positionSol > 0 = long → reduce bids, boost asks
      // positionSol < 0 = short → reduce asks, boost bids
      const absPos = Math.abs(positionSol);
      const skewMult = Math.min(absPos * SKEW_FACTOR, 0.95); // cap at 95% reduction

      // Place bid ladder (LONG orders below oracle)
      const skipBids = positionSol >= MAX_POSITION_SOL;
      if (skipBids) {
        console.log(`  SKIPPING bids: position ${positionSol.toFixed(2)} >= max ${MAX_POSITION_SOL} SOL`);
      } else {
        console.log('  Placing bids...');
        const bidSizeMultiplier = positionSol > 0 ? Math.max(1 - skewMult, 0.05) : (1 + skewMult * 0.5);
        for (let i = 0; i < ladder.length; i++) {
          const { spreadBps, size } = ladder[i];
          const adjustedSize = size * bidSizeMultiplier;
          const offsetPrice = oracleNum * bpsToFraction(spreadBps);
          const offsetBN = Math.round(-offsetPrice * PRICE_PRECISION.toNumber());
          const sizeBase = new BN(Math.round(adjustedSize * BASE_PRECISION.toNumber()));

          try {
            const tx = await driftClient.placePerpOrder({
              marketIndex: MARKET_INDEX,
              orderType: OrderType.LIMIT,
              direction: PositionDirection.LONG,
              baseAssetAmount: sizeBase,
              oraclePriceOffset: offsetBN,
              postOnly: PostOnlyParams.MUST_POST_ONLY,
            });
            if (i === 0 || i === ladder.length - 1) {
              const effectivePrice = (oracleNum - offsetPrice).toFixed(2);
              console.log(`    Bid ${i}: ${adjustedSize.toFixed(4)} SOL @ ~$${effectivePrice}`);
            }
            await sleep(500);
          } catch (e) {
            console.log(`    Bid ${i} FAILED: ${(e.message || e).slice(0, 80)}`);
            await sleep(1000);
          }
        }
      }

      // Place ask ladder (SHORT orders above oracle)
      const skipAsks = positionSol <= -MAX_POSITION_SOL;
      if (skipAsks) {
        console.log(`  SKIPPING asks: position ${positionSol.toFixed(2)} <= -max ${MAX_POSITION_SOL} SOL`);
      } else {
        console.log('  Placing asks...');
        const askSizeMultiplier = positionSol < 0 ? Math.max(1 - skewMult, 0.05) : (1 + skewMult * 0.5);
        for (let i = 0; i < ladder.length; i++) {
          const { spreadBps, size } = ladder[i];
          const adjustedSize = size * askSizeMultiplier;
          const offsetPrice = oracleNum * bpsToFraction(spreadBps);
          const offsetBN = Math.round(offsetPrice * PRICE_PRECISION.toNumber());
          const sizeBase = new BN(Math.round(adjustedSize * BASE_PRECISION.toNumber()));

          try {
            const tx = await driftClient.placePerpOrder({
              marketIndex: MARKET_INDEX,
              orderType: OrderType.LIMIT,
              direction: PositionDirection.SHORT,
              baseAssetAmount: sizeBase,
              oraclePriceOffset: offsetBN,
              postOnly: PostOnlyParams.MUST_POST_ONLY,
            });
            if (i === 0 || i === ladder.length - 1) {
              const effectivePrice = (oracleNum + offsetPrice).toFixed(2);
              console.log(`    Ask ${i}: ${adjustedSize.toFixed(4)} SOL @ ~$${effectivePrice}`);
            }
            await sleep(500);
          } catch (e) {
            console.log(`    Ask ${i} FAILED: ${(e.message || e).slice(0, 80)}`);
            await sleep(1000);
          }
        }
      }

      lastOraclePrice = oracleNum;
      console.log(`  ✓ Refresh complete | Pos: ${posDir}`);
    } catch (e) {
      console.error(`Refresh error: ${e.message || e}`);
    }
  }

  // Initial placement
  await refreshOrders();

  // Periodic refresh
  console.log(`\nRefresh loop every ${REFRESH_INTERVAL_MS / 1000}s (threshold: ${REFRESH_THRESHOLD_BPS} bps)...`);
  setInterval(refreshOrders, REFRESH_INTERVAL_MS);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
