import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, PRICE_PRECISION, BASE_PRECISION, BN } from '@drift-labs/sdk';
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

console.log('=== AMM SPREAD INFO ===');
console.log('longSpread:', amm.longSpread);
console.log('shortSpread:', amm.shortSpread);
console.log('baseSpread:', amm.baseSpread);
console.log('maxSpread:', amm.maxSpread);
console.log('referencepriceOffset:', amm.referencePriceOffset?.toString());
console.log('');
console.log('=== AMM POSITION ===');
console.log('baseAssetAmountWithAmm:', amm.baseAssetAmountWithAmm.toString());
console.log('baseAssetAmountLong:', amm.baseAssetAmountLong.toString());
console.log('baseAssetAmountShort:', amm.baseAssetAmountShort.toString());
console.log('');

// Calculate reserve price
const reservePrice = Number(amm.quoteAssetReserve.toString()) * Number(amm.pegMultiplier.toString()) / Number(amm.baseAssetReserve.toString()) / 1e6;
console.log('reservePrice:', reservePrice.toFixed(6));

// BID_ASK_SPREAD_PRECISION = 1e6
const BAS_PREC = 1000000;

// Bid = reservePrice * (BAS_PREC + (-shortSpread + refPriceOffset)) / BAS_PREC
const shortSpread = amm.shortSpread;
const longSpread = amm.longSpread;
const refOffset = amm.referencePriceOffset || 0;

const bidMultiplier = BAS_PREC + (-shortSpread + Number(refOffset));
const askMultiplier = BAS_PREC + (longSpread + Number(refOffset));

const bidPrice = reservePrice * bidMultiplier / BAS_PREC;
const askPrice = reservePrice * askMultiplier / BAS_PREC;

console.log('Calculated bidPrice:', bidPrice.toFixed(6));
console.log('Calculated askPrice:', askPrice.toFixed(6));
console.log('');

// Oracle 
const oracle = dc.getOracleDataForPerpMarket(0);
const oraclePrice = oracle.price.toNumber() / PRICE_PRECISION.toNumber();
console.log('oraclePrice:', oraclePrice.toFixed(6));
console.log('');

console.log('=== SPREAD ANALYSIS ===');
console.log('shortSpread %:', (shortSpread / BAS_PREC * 100).toFixed(2) + '%');
console.log('longSpread %:', (longSpread / BAS_PREC * 100).toFixed(2) + '%');
console.log('Total spread %:', ((shortSpread + longSpread) / BAS_PREC * 100).toFixed(2) + '%');
console.log('Bid discount from reserve:', ((reservePrice - bidPrice) / reservePrice * 100).toFixed(2) + '%');
console.log('Ask premium from reserve:', ((askPrice - reservePrice) / reservePrice * 100).toFixed(2) + '%');

// Check: can we use admin to update spread?
console.log('');
console.log('=== NET POSITION IMPACT ===');
const netBase = amm.baseAssetAmountWithAmm.toNumber() / BASE_PRECISION.toNumber();
console.log('AMM net position:', netBase.toFixed(4), 'SOL');
console.log('(negative = AMM is short, users are net long)');

await dc.unsubscribe();
process.exit(0);
