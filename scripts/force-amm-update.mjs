/**
 * Force AMM Update — Rapidly calls updateAMMs to decay lastOracleConfPct
 *
 * The _update_amm function (triggered by updateAMMs) is the ONLY code path
 * that runs update_oracle_price_twap, which decays lastOracleConfPct.
 * Neither repegAmmCurve nor resetPerpMarketAmmOracleTwap trigger it.
 *
 * Usage:
 *   node scripts/force-amm-update.mjs
 *   node scripts/force-amm-update.mjs --target 1000   # stop when < 1000
 *   node scripts/force-amm-update.mjs --count 50      # do exactly 50 calls
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RPC_URL = process.env.RPC_URL || 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const PROGRAM_ID = new PublicKey(
  process.env.DRIFT_PROGRAM_ID || 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE'
);
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR || path.join(ROOT, 'keys', 'admin-keypair.json');
const PERP_MARKET_INDEX = 0;

// Parse args
const targetArg = process.argv.findIndex(a => a === '--target');
const TARGET = targetArg > -1 ? parseInt(process.argv[targetArg + 1]) : 1000; // 0.1%

const countArg = process.argv.findIndex(a => a === '--count');
const MAX_COUNT = countArg > -1 ? parseInt(process.argv[countArg + 1]) : 300;

function loadKeypair(filePath) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(filePath, 'utf-8'))));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Force AMM Update — Decay lastOracleConfPct ===');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Target: lastOracleConfPct < ${TARGET}`);
  console.log(`Max calls: ${MAX_COUNT}`);
  console.log();

  const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH);
  const wallet = new Wallet(adminKeypair);
  const connection = new Connection(RPC_URL, 'confirmed');

  const sdk = await import('@drift-labs/sdk');
  const { AdminClient, OracleSource, initialize: sdkInit, PRICE_PRECISION, getPrelaunchOraclePublicKey } = sdk;

  sdkInit({ env: 'devnet' });

  const prelaunchOracle = getPrelaunchOraclePublicKey(PROGRAM_ID, PERP_MARKET_INDEX);

  const client = new AdminClient({
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

  await client.subscribe();
  console.log('[ok] Subscribed');

  // Check initial state
  let market = client.getPerpMarketAccount(PERP_MARKET_INDEX);
  let confPct = market.amm.lastOracleConfPct.toNumber();
  let markStd = market.amm.markStd.toNumber();
  let oracleStd = market.amm.oracleStd.toNumber();
  let longSpread = market.amm.longSpread;
  let shortSpread = market.amm.shortSpread;
  console.log(`[initial] lastOracleConfPct=${confPct} markStd=${markStd} oracleStd=${oracleStd}`);
  console.log(`[initial] longSpread=${longSpread} shortSpread=${shortSpread}`);
  console.log();

  // Build custom updateAMMs instruction with oracle as WRITABLE
  // (Prelaunch oracle's update() mutates the oracle account during price read)
  async function updateAMMsWritableOracle() {
    const { Transaction, ComputeBudgetProgram } = await import('@solana/web3.js');
    const statePublicKey = await client.getStatePublicKey();
    const perpMarket = client.getPerpMarketAccount(PERP_MARKET_INDEX);

    const ix = await client.program.instruction.updateAmms([PERP_MARKET_INDEX], {
      accounts: {
        state: statePublicKey,
        authority: client.wallet.publicKey,
      },
      remainingAccounts: [
        { pubkey: perpMarket.amm.oracle, isWritable: true, isSigner: false }, // WRITABLE for Prelaunch
        { pubkey: perpMarket.pubkey, isWritable: true, isSigner: false },
      ],
    });

    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 });
    const tx = new Transaction().add(cuIx).add(ix);
    tx.feePayer = client.wallet.publicKey;
    const bh = await connection.getLatestBlockhash();
    tx.recentBlockhash = bh.blockhash;
    tx.sign(adminKeypair);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(sig, 'confirmed');
    return sig;
  }

  let count = 0;
  let errors = 0;

  while (count < MAX_COUNT && confPct >= TARGET) {
    try {
      const tx = await updateAMMsWritableOracle();
      count++;

      // Refresh market data
      await sleep(500);
      try { await client.accountSubscriber.fetch(); } catch {}
      market = client.getPerpMarketAccount(PERP_MARKET_INDEX);
      confPct = market.amm.lastOracleConfPct.toNumber();
      markStd = market.amm.markStd.toNumber();
      oracleStd = market.amm.oracleStd.toNumber();
      longSpread = market.amm.longSpread;
      shortSpread = market.amm.shortSpread;

      const ts = new Date().toISOString().slice(11, 19);
      console.log(`[${ts}] #${count} confPct=${confPct} markStd=${markStd} oracleStd=${oracleStd} long=${longSpread} short=${shortSpread} tx=${tx.slice(0,8)}..`);

      // Wait 2 seconds between calls to maximize decay per call
      await sleep(2000);
    } catch (err) {
      errors++;
      console.error(`[ERR #${errors}] ${err.message?.slice(0, 100)}`);
      await sleep(3000);
      if (errors > 10) {
        console.error('Too many errors, aborting');
        break;
      }
    }
  }

  console.log();
  console.log(`=== Done: ${count} calls, ${errors} errors ===`);
  console.log(`Final lastOracleConfPct: ${confPct}`);
  console.log(`Final markStd: ${markStd}`);
  console.log(`Final spreads: long=${longSpread} short=${shortSpread}`);

  await client.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
