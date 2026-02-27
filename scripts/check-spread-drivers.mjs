import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, PRICE_PRECISION, BASE_PRECISION, QUOTE_PRECISION } from '@drift-labs/sdk';
import fs from 'fs';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const adminKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'))));
const w = new Wallet(adminKp);

const cfg = initialize({ env: 'devnet' });
cfg.DRIFT_PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';

const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');

const dc = new DriftClient({
  connection: conn,
  wallet: w,
  programID: new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE'),
  env: 'devnet',
  accountSubscription: { type: 'websocket' },
  perpMarketIndexes,
  spotMarketIndexes,
  oracleInfos,
});

await dc.subscribe();
await new Promise(r => setTimeout(r, 4000));

const market = dc.getPerpMarketAccount(0);
const amm = market.amm;

console.log('=== SPREAD DRIVERS ===');
console.log('lastOracleReservePriceSpreadPct:', amm.lastOracleReservePriceSpreadPct?.toString());
console.log('lastOracleConfPct:', amm.lastOracleConfPct?.toString());
console.log('markStd:', amm.markStd?.toString());
console.log('oracleStd:', amm.oracleStd?.toString());
console.log('');
console.log('=== FEE POOL ===');
console.log('totalFee:', amm.totalFee?.toString());
console.log('totalFeeMinusDistributions:', amm.totalFeeMinusDistributions?.toString());
console.log('totalFeeWithdrawn:', amm.totalFeeWithdrawn?.toString());
console.log('netRevenueSinceLastFunding:', amm.netRevenueSinceLastFunding?.toString());
console.log('');
console.log('=== AMM SPREAD ADJUSTMENTS ===');
console.log('ammSpreadAdjustment:', amm.ammSpreadAdjustment?.toString());
console.log('ammInventorySpreadAdjustment:', amm.ammInventorySpreadAdjustment?.toString());
console.log('');
console.log('=== HISTORICAL ORACLE DATA ===');
console.log('lastOraclePrice:', amm.historicalOracleData?.lastOraclePrice?.toString());
console.log('lastOraclePriceTwap:', amm.historicalOracleData?.lastOraclePriceTwap?.toString());
console.log('lastOraclePriceTwap5Min:', amm.historicalOracleData?.lastOraclePriceTwap5Min?.toString());
console.log('lastOracleDelay:', amm.historicalOracleData?.lastOracleDelay?.toString());
console.log('lastOracleConfPct:', amm.historicalOracleData?.lastOracleConfPct?.toString());
console.log('');
console.log('=== RESERVE PRICE INFO ===');
const reservePrice = Number(amm.quoteAssetReserve.toString()) * Number(amm.pegMultiplier.toString()) / Number(amm.baseAssetReserve.toString()) / 1e6;
const oracleData = dc.getOracleDataForPerpMarket(0);
const oraclePrice = oracleData.price.toNumber() / PRICE_PRECISION.toNumber();
console.log('Reserve price:', reservePrice.toFixed(6));
console.log('Oracle price:', oraclePrice.toFixed(6));
console.log('Oracle conf:', oracleData.confidence?.toString());
console.log('');

// Calculate max_spread_baseline
const lastOracleReservePriceSpreadPct = Math.abs(Number(amm.lastOracleReservePriceSpreadPct?.toString() || '0'));
const lastOracleConfPct2x = Number(amm.lastOracleConfPct?.toString() || '0') * 2;
const markStdPct = Number(amm.markStd?.toString() || '0') * 1000000 / reservePrice / 1e6;
const oracleStdPct = Number(amm.oracleStd?.toString() || '0') * 1000000 / reservePrice / 1e6;
const maxStdPct = Math.max(markStdPct, oracleStdPct);

console.log('=== MAX_TARGET_SPREAD CALCULATION ===');
console.log('lastOracleReservePriceSpreadPct (abs):', lastOracleReservePriceSpreadPct);
console.log('lastOracleConfPct * 2:', lastOracleConfPct2x);
console.log('max(markStd, oracleStd) as pct:', maxStdPct.toFixed(0));
console.log('maxSpread (configured):', amm.maxSpread);
console.log('max_spread_baseline = max(above 3 items):', Math.max(lastOracleReservePriceSpreadPct, lastOracleConfPct2x, maxStdPct).toFixed(0));
console.log('max_target_spread = max(maxSpread, baseline):', Math.max(amm.maxSpread, lastOracleReservePriceSpreadPct, lastOracleConfPct2x, maxStdPct).toFixed(0));

// Check fee deficit
const tfd = Number(amm.totalFeeMinusDistributions?.toString() || '0');
console.log('');
console.log('=== DEFICIT CHECK ===');
console.log('totalFeeMinusDistributions:', tfd);
console.log('Is in deficit (<=0)?', tfd <= 0 ? 'YES (10x blow-up!)' : 'NO');

await dc.unsubscribe();
process.exit(0);
