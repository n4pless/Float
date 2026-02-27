import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, BASE_PRECISION, PRICE_PRECISION, QUOTE_PRECISION, BN } from '@drift-labs/sdk';
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

console.log('=== PERP MARKET 0 ===');
console.log('marginRatioInitial:', market.marginRatioInitial);
console.log('marginRatioMaintenance:', market.marginRatioMaintenance);
console.log('');
console.log('=== AMM STATE ===');
console.log('sqrtK:', amm.sqrtK.toString());
console.log('baseAssetReserve:', amm.baseAssetReserve.toString());
console.log('quoteAssetReserve:', amm.quoteAssetReserve.toString());
console.log('baseAssetAmountWithAmm:', amm.baseAssetAmountWithAmm.toString());
console.log('pegMultiplier:', amm.pegMultiplier.toString());

// Calculate vBid and vAsk
const baseReserve = amm.baseAssetReserve;
const quoteReserve = amm.quoteAssetReserve;
const peg = amm.pegMultiplier;

// vBid = sell price = (quoteReserve / (baseReserve + 1)) * peg / 1e6
// vAsk = buy price = (quoteReserve / (baseReserve - 1)) * peg / 1e6
// Simplified: price = quoteReserve * peg / baseReserve / 1e6
const midPrice = Number(quoteReserve.toString()) * Number(peg.toString()) / Number(baseReserve.toString()) / 1e6;
console.log('');
console.log('Mid price (approx):', midPrice.toFixed(4));

// Oracle price
const oracleData = dc.getOracleDataForPerpMarket(0);
const oraclePrice = oracleData.price.toNumber() / PRICE_PRECISION.toNumber();
console.log('Oracle price:', oraclePrice.toFixed(4));
console.log('Mid vs Oracle divergence:', ((midPrice - oraclePrice) / oraclePrice * 100).toFixed(2) + '%');

// Check oracle guard rails
const state = dc.getStateAccount();
console.log('');
console.log('=== ORACLE GUARD RAILS ===');
console.log('priceDivergence.markOraclePercentDivergence:', state.oracleGuardRails.priceDivergence.markOraclePercentDivergence.toString());
console.log('priceDivergence.oracleTwap5MinPercentDivergence:', state.oracleGuardRails.priceDivergence.oracleTwap5MinPercentDivergence.toString());

// Simulate fill: for a SHORT (sell) order to reduce a LONG position against AMM,
// the fill price would be the bid (selling into AMM)
// For a small sell of 5 SOL base:
const sellBase = new BN(5).mul(BASE_PRECISION);
const newBase = baseReserve.add(sellBase);
const newQuote = amm.sqrtK.mul(amm.sqrtK).div(newBase);
const quoteReceived = quoteReserve.sub(newQuote);
const fillPrice = Number(quoteReceived.toString()) * Number(peg.toString()) / Number(sellBase.toString()) / 1e6;
console.log('');
console.log('=== SIMULATED FILL FOR 5 SOL SHORT ===');
console.log('Fill price (bid):', fillPrice.toFixed(4));
console.log('Fill vs Oracle divergence:', ((fillPrice - oraclePrice) / oraclePrice * 100).toFixed(2) + '%');
console.log('Would pass 50% band?', Math.abs((fillPrice - oraclePrice) / oraclePrice) < 0.50 ? 'YES' : 'NO');
console.log('Would pass 95% band?', Math.abs((fillPrice - oraclePrice) / oraclePrice) < 0.95 ? 'YES' : 'NO');

await dc.unsubscribe();
process.exit(0);
