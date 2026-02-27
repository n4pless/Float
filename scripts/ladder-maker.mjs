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
const RPC_URL = process.env.ENDPOINT || 'https://api.devnet.solana.com';
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
const REFRESH_INTERVAL_MS = 30_000;  // check every 30s whether orders need refreshing
const REFRESH_THRESHOLD_BPS = 50;    // refresh if oracle has moved >50 bps since last placement

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
      console.log(`\n[${new Date().toISOString()}] Oracle: $${oracleNum.toFixed(2)}`);

      // Check if refresh is needed
      if (lastOraclePrice > 0) {
        const moveBps = Math.abs(oracleNum - lastOraclePrice) / lastOraclePrice * 10_000;
        if (moveBps < REFRESH_THRESHOLD_BPS) {
          console.log(`  Oracle moved ${moveBps.toFixed(1)} bps < ${REFRESH_THRESHOLD_BPS} bps threshold, skipping refresh`);
          return;
        }
        console.log(`  Oracle moved ${moveBps.toFixed(1)} bps, refreshing orders`);
      }

      // Cancel all existing orders for this market
      try {
        const user = driftClient.getUserAccount();
        const openOrders = user.orders.filter(
          o => 'open' in (o.status) && o.marketIndex === MARKET_INDEX && !o.baseAssetAmount.isZero()
        );
        if (openOrders.length > 0) {
          console.log(`  Cancelling ${openOrders.length} existing orders...`);
          await driftClient.cancelOrders(undefined, undefined, undefined);
          await sleep(2000); // wait for cancellations to settle
        }
      } catch (e) {
        console.log(`  Cancel warning: ${e.message || e}`);
      }

      // Place bid ladder (LONG orders below oracle)
      console.log('  Placing bids...');
      for (let i = 0; i < ladder.length; i++) {
        const { spreadBps, size } = ladder[i];
        const offsetPrice = oracleNum * bpsToFraction(spreadBps);
        // oraclePriceOffset is in PRICE_PRECISION units, negative for below oracle
        const offsetBN = Math.round(-offsetPrice * PRICE_PRECISION.toNumber());
        const sizeBase = new BN(Math.round(size * BASE_PRECISION.toNumber()));

        try {
          const tx = await driftClient.placePerpOrder({
            marketIndex: MARKET_INDEX,
            orderType: OrderType.LIMIT,
            direction: PositionDirection.LONG,
            baseAssetAmount: sizeBase,
            oraclePriceOffset: offsetBN,
            postOnly: PostOnlyParams.MUST_POST_ONLY,
          });
          const effectivePrice = (oracleNum - offsetPrice).toFixed(2);
          console.log(`    Bid ${i}: ${size.toFixed(4)} SOL @ ~$${effectivePrice} (offset ${offsetBN}) tx: ${tx.slice(0, 16)}...`);
          await sleep(500); // rate limit protection
        } catch (e) {
          console.log(`    Bid ${i} FAILED: ${e.message || e}`);
          await sleep(1000);
        }
      }

      // Place ask ladder (SHORT orders above oracle)
      console.log('  Placing asks...');
      for (let i = 0; i < ladder.length; i++) {
        const { spreadBps, size } = ladder[i];
        const offsetPrice = oracleNum * bpsToFraction(spreadBps);
        // positive offset for above oracle
        const offsetBN = Math.round(offsetPrice * PRICE_PRECISION.toNumber());
        const sizeBase = new BN(Math.round(size * BASE_PRECISION.toNumber()));

        try {
          const tx = await driftClient.placePerpOrder({
            marketIndex: MARKET_INDEX,
            orderType: OrderType.LIMIT,
            direction: PositionDirection.SHORT,
            baseAssetAmount: sizeBase,
            oraclePriceOffset: offsetBN,
            postOnly: PostOnlyParams.MUST_POST_ONLY,
          });
          const effectivePrice = (oracleNum + offsetPrice).toFixed(2);
          console.log(`    Ask ${i}: ${size.toFixed(4)} SOL @ ~$${effectivePrice} (offset +${offsetBN}) tx: ${tx.slice(0, 16)}...`);
          await sleep(500); // rate limit protection
        } catch (e) {
          console.log(`    Ask ${i} FAILED: ${e.message || e}`);
          await sleep(1000);
        }
      }

      lastOraclePrice = oracleNum;
      console.log(`  ✓ Placed ${LEVELS_PER_SIDE} bids + ${LEVELS_PER_SIDE} asks`);
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
