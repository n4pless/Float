/**
 * Fix AMM State — Recenter AMM + reset markStd + decay all stale metrics
 *
 * Problems:
 * 1. Reserve price $53.67 vs oracle $81.65 (34% divergence) → wide spread
 * 2. markStd = $19.56 (stale) → inflates max_target_spread
 * 3. AMM position -201 SOL skews reserves
 *
 * Fix:
 * - Recenter AMM with oracle-aligned peg and larger sqrtK to reduce impact
 * - Call updatePerpBidAskTwap to reset markStd
 * - Run updateAMMs to propagate new spreads
 */

import { Connection, Keypair, PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');

function loadKeypair(p) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(p, 'utf-8'))));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Fix AMM State ===\n');

  const kp = loadKeypair(path.join(ROOT, 'keys', 'admin-keypair.json'));
  const wallet = new Wallet(kp);
  const connection = new Connection(RPC_URL, 'confirmed');

  const sdk = await import('@drift-labs/sdk');
  const {
    AdminClient, OracleSource, initialize: sdkInit,
    PRICE_PRECISION, getPrelaunchOraclePublicKey,
    AMM_RESERVE_PRECISION, PEG_PRECISION,
  } = sdk;

  sdkInit({ env: 'devnet' });

  const oracle = getPrelaunchOraclePublicKey(PROGRAM_ID, 0);

  const client = new AdminClient({
    connection,
    wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: oracle, source: OracleSource.Prelaunch }],
    txVersion: 'legacy',
  });

  await client.subscribe();
  console.log('[ok] Subscribed\n');

  // Get current state
  let market = client.getPerpMarketAccount(0);
  const amm = market.amm;

  const reservePrice = amm.reservePrice ? amm.reservePrice.toNumber() : null;
  const sqrtK = amm.sqrtK.toString();
  const pegMult = amm.pegMultiplier.toString();
  const baseReserve = amm.baseAssetReserve.toString();
  const quoteReserve = amm.quoteAssetReserve.toString();
  const ammPos = amm.baseAssetAmountWithAmm.toString();

  console.log('Current AMM state:');
  console.log(`  sqrtK:          ${sqrtK}`);
  console.log(`  pegMultiplier:  ${pegMult}`);
  console.log(`  baseReserve:    ${baseReserve}`);
  console.log(`  quoteReserve:   ${quoteReserve}`);
  console.log(`  ammPosition:    ${ammPos}`);
  console.log(`  markStd:        ${amm.markStd.toString()}`);
  console.log(`  oracleStd:      ${amm.oracleStd.toString()}`);
  console.log(`  lastOracleConfPct: ${amm.lastOracleConfPct.toString()}`);
  console.log(`  lastOracleReservePriceSpreadPct: ${amm.lastOracleReservePriceSpreadPct.toString()}`);
  console.log(`  longSpread:     ${amm.longSpread}`);
  console.log(`  shortSpread:    ${amm.shortSpread}`);
  console.log(`  curveUpdateIntensity: ${amm.curveUpdateIntensity}`);
  console.log();

  // Get oracle price
  const oracleData = client.getOracleDataForPerpMarket(0);
  const oraclePrice = oracleData.price.toNumber() / PRICE_PRECISION.toNumber();
  console.log(`Oracle price: $${oraclePrice.toFixed(2)}`);
  console.log();

  // Step 1: Recenter with larger sqrtK and oracle-aligned peg
  // New peg = oracle price * PEG_PRECISION
  const newPeg = new BN(Math.round(oraclePrice * 1e6));

  // Increase sqrtK by 10x to reduce price impact of the -201 SOL position
  const currentSqrtK = new BN(sqrtK);
  const newSqrtK = currentSqrtK.mul(new BN(10));

  console.log(`Step 1: Recenter AMM`);
  console.log(`  New peg: ${newPeg.toString()} ($${oraclePrice.toFixed(2)})`);
  console.log(`  New sqrtK: ${newSqrtK.toString()} (10x current)`);

  try {
    const tx = await client.recenterPerpMarketAmm(0, newPeg, newSqrtK);
    console.log(`  [ok] Recenter TX: ${tx.slice(0, 12)}..`);
  } catch (err) {
    console.error(`  [FAIL] Recenter: ${err.message?.slice(0, 150)}`);
    // Try with smaller multiplier
    console.log('  Trying with 5x sqrtK instead...');
    const newSqrtK5 = currentSqrtK.mul(new BN(5));
    try {
      const tx = await client.recenterPerpMarketAmm(0, newPeg, newSqrtK5);
      console.log(`  [ok] Recenter TX: ${tx.slice(0, 12)}..`);
    } catch (err2) {
      console.error(`  [FAIL] 5x: ${err2.message?.slice(0, 150)}`);
      // Try with same sqrtK
      console.log('  Trying with same sqrtK...');
      try {
        const tx = await client.recenterPerpMarketAmm(0, newPeg, currentSqrtK);
        console.log(`  [ok] Recenter TX: ${tx.slice(0, 12)}..`);
      } catch (err3) {
        console.error(`  [FAIL] same K: ${err3.message?.slice(0, 150)}`);
      }
    }
  }

  await sleep(2000);
  try { await client.accountSubscriber.fetch(); } catch {}

  // Check new state
  market = client.getPerpMarketAccount(0);
  console.log(`\n  After recenter:`);
  console.log(`  sqrtK:          ${market.amm.sqrtK.toString()}`);
  console.log(`  pegMultiplier:  ${market.amm.pegMultiplier.toString()}`);
  console.log(`  baseReserve:    ${market.amm.baseAssetReserve.toString()}`);
  console.log(`  quoteReserve:   ${market.amm.quoteAssetReserve.toString()}`);
  console.log(`  longSpread:     ${market.amm.longSpread}`);
  console.log(`  shortSpread:    ${market.amm.shortSpread}`);
  console.log();

  // Step 2: Run updateAMMs to propagate (with writable oracle)
  console.log('Step 2: updateAMMs (writable oracle)');
  try {
    const perpMarket = client.getPerpMarketAccount(0);
    const statePublicKey = await client.getStatePublicKey();
    const ix = await client.program.instruction.updateAmms([0], {
      accounts: { state: statePublicKey, authority: client.wallet.publicKey },
      remainingAccounts: [
        { pubkey: perpMarket.amm.oracle, isWritable: true, isSigner: false },
        { pubkey: perpMarket.pubkey, isWritable: true, isSigner: false },
      ],
    });
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const tx = new Transaction().add(cuIx).add(ix);
    tx.feePayer = kp.publicKey;
    const bh = await connection.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.sign(kp);
    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');
    console.log(`  [ok] updateAMMs TX: ${sig.slice(0, 12)}..`);
  } catch (err) {
    console.error(`  [FAIL] updateAMMs: ${err.message?.slice(0, 150)}`);
  }

  await sleep(2000);
  try { await client.accountSubscriber.fetch(); } catch {}

  // Step 3: Reset markStd by calling updatePerpBidAskTwap
  // This requires passing maker accounts in remaining_accounts
  // For a simple crank with no makers, we can try passing just the market + oracle
  console.log('\nStep 3: Update mark TWAP (bid/ask)');
  try {
    // The updatePerpBidAskTwap instruction requires specific accounts
    // Let's try the SDK method if available
    if (typeof client.updatePerpBidAskTwap === 'function') {
      const tx = await client.updatePerpBidAskTwap(0, []);
      console.log(`  [ok] updatePerpBidAskTwap TX: ${tx.slice(0, 12)}..`);
    } else {
      // Build manually
      const perpMarket = client.getPerpMarketAccount(0);
      const statePublicKey = await client.getStatePublicKey();
      const ix = await client.program.instruction.updatePerpBidAskTwap(
        null, // depth
        {
          accounts: {
            state: statePublicKey,
            perpMarket: perpMarket.pubkey,
            oracle: perpMarket.amm.oracle,
            authority: client.wallet.publicKey,
            keeperStats: client.wallet.publicKey, // might not work
          },
          remainingAccounts: [],
        }
      );
      const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
      const tx = new Transaction().add(cuIx).add(ix);
      tx.feePayer = kp.publicKey;
      const bh = await connection.getLatestBlockhash();
      tx.recentBlockhash = bh.blockhash;
      tx.sign(kp);
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      console.log(`  [ok] updatePerpBidAskTwap TX: ${sig.slice(0, 12)}..`);
    }
  } catch (err) {
    console.error(`  [FAIL] updatePerpBidAskTwap: ${err.message?.slice(0, 150)}`);
  }

  await sleep(2000);
  try { await client.accountSubscriber.fetch(); } catch {}

  // Final state
  market = client.getPerpMarketAccount(0);
  console.log('\n=== Final State ===');
  console.log(`  sqrtK:          ${market.amm.sqrtK.toString()}`);
  console.log(`  pegMultiplier:  ${market.amm.pegMultiplier.toString()}`);
  console.log(`  markStd:        ${market.amm.markStd.toString()}`);
  console.log(`  oracleStd:      ${market.amm.oracleStd.toString()}`);
  console.log(`  lastOracleConfPct: ${market.amm.lastOracleConfPct.toString()}`);
  console.log(`  lastOracleReservePriceSpreadPct: ${market.amm.lastOracleReservePriceSpreadPct.toString()}`);
  console.log(`  longSpread:     ${market.amm.longSpread}`);
  console.log(`  shortSpread:    ${market.amm.shortSpread}`);
  console.log(`  ammPosition:    ${market.amm.baseAssetAmountWithAmm.toString()}`);

  // Compute effective reserve price
  const qr = BigInt(market.amm.quoteAssetReserve.toString());
  const br = BigInt(market.amm.baseAssetReserve.toString());
  const peg = BigInt(market.amm.pegMultiplier.toString());
  const rp = Number((qr * peg * 1000000n) / (br * 1000000n)) / 1e6;
  console.log(`  reservePrice:   $${rp.toFixed(4)}`);
  console.log(`  oraclePrice:    $${oraclePrice.toFixed(2)}`);
  console.log(`  divergence:     ${((rp - oraclePrice) / oraclePrice * 100).toFixed(2)}%`);

  await client.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
