/**
 * Update Prelaunch Oracle Price
 *
 * Fetches the real SOL/USD price from CoinGecko (or Binance fallback)
 * and updates the on-chain Prelaunch oracle used by the SOL-PERP market.
 *
 * Run:  node scripts/update-oracle-price.mjs
 * Auto: node scripts/update-oracle-price.mjs --loop   (updates every 60s)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RPC_URL = 'https://api.devnet.solana.com';
const DRIFT_PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const PERP_MARKET_INDEX = 0;

function loadKeypair(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return Keypair.fromSecretKey(new Uint8Array(data));
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Fetch real SOL/USD price — CoinGecko first, Binance fallback */
async function fetchSolPrice() {
  // Try CoinGecko
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json();
      if (data.solana?.usd) return data.solana.usd;
    }
  } catch {}

  // Fallback: Binance
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    if (res.ok) {
      const data = await res.json();
      if (data.price) return parseFloat(data.price);
    }
  } catch {}

  // Fallback: CryptoCompare
  try {
    const res = await fetch('https://min-api.cryptocompare.com/data/price?fsym=SOL&tsyms=USD');
    if (res.ok) {
      const data = await res.json();
      if (data.USD) return data.USD;
    }
  } catch {}

  throw new Error('Failed to fetch SOL price from all sources');
}

async function updateOracle(adminClient, price) {
  const sdk = await import('@drift-labs/sdk');
  const { PRICE_PRECISION, PEG_PRECISION } = sdk;

  // Convert dollar price to BN with PRICE_PRECISION (1e6)
  const priceBN = new BN(Math.round(price * 1e6));
  const maxPriceBN = new BN(10000).mul(PRICE_PRECISION); // $10,000 max

  // 1. Update the Prelaunch oracle price
  console.log(`[..] Updating Prelaunch oracle to $${price.toFixed(2)} (BN: ${priceBN.toString()})...`);
  const txSig = await adminClient.updatePrelaunchOracleParams(
    PERP_MARKET_INDEX,
    priceBN,
    maxPriceBN,
  );
  console.log(`[ok] Oracle updated! Tx: ${txSig}`);

  // 2. Move the AMM price to match the new oracle price
  await sleep(2000); // wait for oracle update to propagate
  try {
    const targetPriceBN = new BN(Math.round(price * 1e6)); // PRICE_PRECISION
    console.log(`[..] Moving AMM price to $${price.toFixed(2)}...`);
    const moveTx = await adminClient.moveAmmToPrice(PERP_MARKET_INDEX, targetPriceBN);
    console.log(`[ok] AMM price moved! Tx: ${moveTx}`);
  } catch (err) {
    console.warn(`[!!] AMM move failed (non-fatal): ${err.message?.slice(0, 200)}`);
  }

  return txSig;
}

async function main() {
  const loopMode = process.argv.includes('--loop');
  const loopInterval = 60_000; // 60 seconds

  console.log('\n' + '='.repeat(60));
  console.log('  PRELAUNCH ORACLE PRICE UPDATER');
  console.log('  Program: ' + DRIFT_PROGRAM_ID.toString());
  console.log('  Mode: ' + (loopMode ? `Loop (every ${loopInterval / 1000}s)` : 'One-shot'));
  console.log('='.repeat(60) + '\n');

  // Load admin keypair
  const adminPath = path.join(ROOT, 'keys', 'admin-keypair.json');
  if (!fs.existsSync(adminPath)) {
    console.error(`[!!] Admin keypair not found at ${adminPath}`);
    process.exit(1);
  }
  const adminKeypair = loadKeypair(adminPath);
  const wallet = new Wallet(adminKeypair);
  console.log(`[ok] Admin: ${adminKeypair.publicKey.toString()}`);

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log(`[ok] Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  // Initialize AdminClient
  const sdk = await import('@drift-labs/sdk');
  const { AdminClient, BulkAccountLoader, OracleSource, initialize: sdkInit, PRICE_PRECISION, getPrelaunchOraclePublicKey } = sdk;

  sdkInit({ env: 'devnet' });

  const bulkLoader = new BulkAccountLoader(connection, 'confirmed', 5000);

  const prelaunchOracle = getPrelaunchOraclePublicKey(DRIFT_PROGRAM_ID, PERP_MARKET_INDEX);
  console.log(`[ok] Prelaunch oracle PDA: ${prelaunchOracle.toString()}`);

  const adminClient = new AdminClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    env: 'devnet',
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkLoader,
    },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0, 1],
    oracleInfos: [
      {
        publicKey: prelaunchOracle,
        source: OracleSource.Prelaunch,
      },
    ],
  });

  await adminClient.subscribe();
  console.log('[ok] AdminClient subscribed\n');

  // Read current oracle price
  try {
    const oracleData = adminClient.getOracleDataForPerpMarket(PERP_MARKET_INDEX);
    if (oracleData) {
      const currentPrice = oracleData.price.toNumber() / PRICE_PRECISION.toNumber();
      console.log(`[..] Current on-chain oracle price: $${currentPrice.toFixed(2)}`);
    }
  } catch {}

  const doUpdate = async () => {
    try {
      const realPrice = await fetchSolPrice();
      console.log(`[ok] Real SOL/USD price: $${realPrice.toFixed(2)}`);
      await updateOracle(adminClient, realPrice);
    } catch (err) {
      console.error(`[!!] Update failed: ${err.message}`);
    }
  };

  // Run once
  await doUpdate();

  // Loop mode
  if (loopMode) {
    console.log(`\n[..] Running in loop mode. Updating every ${loopInterval / 1000}s. Press Ctrl+C to stop.\n`);
    while (true) {
      await sleep(loopInterval);
      await doUpdate();
    }
  } else {
    // Clean shutdown
    await adminClient.unsubscribe();
    console.log('\n[ok] Done.');
  }
}

main().catch(err => {
  console.error('[!!] Fatal:', err);
  process.exit(1);
});
