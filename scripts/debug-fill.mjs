import { Connection, Keypair, PublicKey, ComputeBudgetProgram } from '@solana/web3.js';
import { AdminClient, DriftClient, Wallet, OracleSource, initialize, getMarketsAndOraclesForSubscription, 
  getPrelaunchOraclePublicKey, BASE_PRECISION, PRICE_PRECISION, PositionDirection, OrderType, BN } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const RPC = 'https://api.devnet.solana.com';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  
  const adminKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
    fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json')
  )));
  const makerKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
    fs.readFileSync('/home/gorcore/Drift-Clone/keys/maker-keypair.json')
  )));
  
  const cfg = initialize({ env: 'devnet' });
  cfg.DRIFT_PROGRAM_ID = PROGRAM_ID;
  
  const prelaunchOracle = getPrelaunchOraclePublicKey(new PublicKey(PROGRAM_ID), 0);
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');
  
  const admin = new AdminClient({
    connection: conn,
    wallet: new Wallet(adminKp),
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos: [{ publicKey: prelaunchOracle, source: OracleSource.Prelaunch }],
    txVersion: 'legacy',
  });
  
  const maker = new DriftClient({
    connection: conn,
    wallet: new Wallet(makerKp),
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
    txParams: { computeUnitsPrice: 50000 },
  });
  
  await admin.subscribe();
  await maker.subscribe();
  await new Promise(r => setTimeout(r, 5000));
  
  // Step 1: Set curveUpdateIntensity to 0
  let mkt = admin.getPerpMarketAccount(0);
  console.log('Current curveUpdateIntensity:', mkt.amm.curveUpdateIntensity);
  console.log('Current longSpread:', mkt.amm.longSpread, 'shortSpread:', mkt.amm.shortSpread);
  
  if (mkt.amm.curveUpdateIntensity !== 0) {
    console.log('\nSetting curveUpdateIntensity to 0...');
    await admin.updatePerpMarketCurveUpdateIntensity(0, 0);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Step 2: Recenter to trigger update_spreads
  console.log('\nRecentering AMM...');
  mkt = admin.getPerpMarketAccount(0);
  await admin.recenterPerpMarketAmm(0, mkt.amm.pegMultiplier, mkt.amm.sqrtK);
  await new Promise(r => setTimeout(r, 3000));
  
  // Step 3: Reset oracle TWAPs via updatePrelaunchOracleParams
  console.log('\nResetting oracle TWAPs...');
  const oraclePrice = mkt.amm.historicalOracleData.lastOraclePrice;
  const oraclePriceNum = oraclePrice.toNumber() / PRICE_PRECISION.toNumber();
  console.log('  Oracle price:', oraclePriceNum);
  try {
    // Use fresh BN to avoid version mismatch
    const priceBN = new BN(oraclePrice.toString());
    const maxPriceBN = new BN(1000).mul(PRICE_PRECISION);
    await admin.updatePrelaunchOracleParams(0, priceBN, maxPriceBN);
    console.log('  Oracle TWAPs reset');
  } catch(e) {
    console.log('  Oracle reset error:', e.message?.slice(0, 200));
  }
  
  // Step 4: Widen margins
  console.log('\nWidening margins to 9500...');
  await admin.updatePerpMarketMarginRatio(0, 9500, 2500);
  
  console.log('Widening guard rails to 99%...');
  await admin.updateOracleGuardRails({
    priceDivergence: {
      markOraclePercentDivergence: new BN(990000),
      oracleTwap5MinPercentDivergence: new BN(990000),
    },
    validity: {
      slotsBeforeStaleForAmm: new BN(36000),
      slotsBeforeStaleForMargin: new BN(120),
      confidenceIntervalMaxSize: new BN(1000000),
      tooVolatileRatio: new BN(5),
    },
  });
  
  await new Promise(r => setTimeout(r, 8000));
  await admin.fetchAccounts();
  await maker.fetchAccounts();
  
  // Print full AMM state  
  mkt = admin.getPerpMarketAccount(0);
  const amm = mkt.amm;
  console.log('\n=== FULL AMM STATE ===');
  console.log('curveUpdateIntensity:', amm.curveUpdateIntensity);
  console.log('longSpread:', amm.longSpread);
  console.log('shortSpread:', amm.shortSpread);
  console.log('baseSpread:', amm.baseSpread);
  console.log('maxSpread:', amm.maxSpread);
  console.log('pegMultiplier:', amm.pegMultiplier.toString());
  console.log('sqrtK:', amm.sqrtK.toString());
  console.log('baseAssetReserve:', amm.baseAssetReserve.toString());
  console.log('quoteAssetReserve:', amm.quoteAssetReserve.toString());
  console.log('terminalQuoteAssetReserve:', amm.terminalQuoteAssetReserve.toString());
  console.log('baseAssetAmountWithAmm:', amm.baseAssetAmountWithAmm.toString());
  console.log('baseAssetAmountLong:', amm.baseAssetAmountLong.toString());
  console.log('baseAssetAmountShort:', amm.baseAssetAmountShort.toString());
  console.log('quoteAssetAmount:', amm.quoteAssetAmount?.toString());
  console.log('totalFee:', amm.totalFee.toString());
  console.log('totalFeeMinusDistributions:', amm.totalFeeMinusDistributions.toString());
  console.log('lastOracleConfPct:', amm.lastOracleConfPct?.toString());
  console.log('lastOracleReservePriceSpreadPct:', amm.lastOracleReservePriceSpreadPct?.toString());
  console.log('lastOraclePrice:', amm.historicalOracleData?.lastOraclePrice?.toString());
  console.log('lastOracleConf:', amm.historicalOracleData?.lastOracleConf?.toString());
  console.log('lastOraclePriceTwap:', amm.historicalOracleData?.lastOraclePriceTwap?.toString());
  console.log('lastOraclePriceTwap5Min:', amm.historicalOracleData?.lastOraclePriceTwap5Min?.toString());
  console.log('markStd:', amm.markStd?.toString());
  console.log('oracleStd:', amm.oracleStd?.toString());
  console.log('lastMarkPriceTwap:', amm.lastMarkPriceTwap?.toString());
  console.log('lastMarkPriceTwap5Min:', amm.lastMarkPriceTwap5Min?.toString());
  console.log('lastBidPriceTwap:', amm.lastBidPriceTwap?.toString());
  console.log('lastAskPriceTwap:', amm.lastAskPriceTwap?.toString());
  console.log('last24HAvgFundingRate:', amm.last24HAvgFundingRate?.toString());
  console.log('lastFundingRate:', amm.lastFundingRate?.toString());
  console.log('cumulativeFundingRateLong:', amm.cumulativeFundingRateLong?.toString());
  console.log('cumulativeFundingRateShort:', amm.cumulativeFundingRateShort?.toString());
  console.log('reservePrice:', (amm.quoteAssetReserve.mul(amm.pegMultiplier).div(amm.baseAssetReserve).toNumber() / 1e6).toFixed(6));
  console.log('marginRatioInitial:', mkt.marginRatioInitial);
  console.log('marginRatioMaintenance:', mkt.marginRatioMaintenance);
  
  // Read oracle data
  const oracleAcct = await conn.getAccountInfo(prelaunchOracle);
  if (oracleAcct) {
    console.log('\n=== ORACLE DATA (raw bytes) ===');
    console.log('Oracle account size:', oracleAcct.data.length);
    // PrelaunchOracle: price(i64,8), maxPrice(i64,8), confidence(u64,8), 
    // lastUpdateSlot(u64,8), ammLastUpdateSlot(u64,8),
    // perpMarketIndex(u16,2), padding(6 bytes)
    // lastBidPriceTwap(i64,8), lastAskPriceTwap(i64,8), etc.
    const data = oracleAcct.data;
    // Skip 8 bytes discriminator
    const offset = 8;
    const price = data.readBigInt64LE(offset);
    const maxPrice = data.readBigInt64LE(offset + 8);
    const confidence = data.readBigUInt64LE(offset + 16);
    const lastUpdateSlot = data.readBigUInt64LE(offset + 24);
    const ammLastUpdateSlot = data.readBigUInt64LE(offset + 32);
    const perpMarketIndex = data.readUInt16LE(offset + 40);
    // padding 6 bytes
    // Then PrelaunchOracleParams at offset + 48
    // price(i64), maxPrice(i64)     
    // Then historical fields
    console.log('price:', price.toString(), '($' + (Number(price) / 1e6).toFixed(4) + ')');
    console.log('maxPrice:', maxPrice.toString());
    console.log('confidence:', confidence.toString(), '($' + (Number(confidence) / 1e6).toFixed(4) + ')');
    console.log('lastUpdateSlot:', lastUpdateSlot.toString());
    console.log('ammLastUpdateSlot:', ammLastUpdateSlot.toString());
    console.log('perpMarketIndex:', perpMarketIndex);
  }
  
  // Check position
  const pos = maker.getUser().getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (!pos) {
    console.log('\nNo position found!');
    await restoreAndExit(admin, maker);
    return;
  }
  const totalSol = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('\n=== POSITION ===');  
  console.log('baseAssetAmount:', pos.baseAssetAmount.toString());
  console.log('quoteBreakEvenAmount:', pos.quoteBreakEvenAmount?.toString());
  console.log('quoteEntryAmount:', pos.quoteEntryAmount?.toString());
  console.log('lastCumulativeFundingRate:', pos.lastCumulativeFundingRate?.toString());
  console.log('Position:', totalSol > 0 ? 'LONG' : 'SHORT', Math.abs(totalSol).toFixed(4), 'SOL');
  
  // Try the fill and print FULL logs
  console.log('\n=== ATTEMPTING FILL ===');
  
  // Try MARKET first
  console.log('\n--- MARKET SHORT 1 SOL ---');
  try {
    const txSig = await maker.placeAndTakePerpOrder({
      orderType: OrderType.MARKET,
      marketIndex: 0,
      direction: PositionDirection.SHORT,
      baseAssetAmount: BASE_PRECISION, // 1 SOL
      reduceOnly: true,
      auctionDuration: 0,
    });
    console.log('SUCCESS! TX:', txSig);
  } catch(e) {
    const msg = e.message || '';
    console.log('FAILED:', msg);
    // Try to extract full logs
    if (e.logs) {
      console.log('\nFull logs:');
      for (const log of e.logs) {
        console.log(' ', log);
      }
    }
    if (e.simulationResponse) {
      console.log('\nSimulation logs:');
      for (const log of (e.simulationResponse.logs || [])) {
        console.log(' ', log);
      }
    }
  }
  
  // Try LIMIT at oracle price
  console.log('\n--- LIMIT SHORT 1 SOL at $1 ---');
  try {
    const txSig = await maker.placeAndTakePerpOrder({
      orderType: OrderType.LIMIT,
      marketIndex: 0,
      direction: PositionDirection.SHORT,
      baseAssetAmount: BASE_PRECISION, // 1 SOL
      price: PRICE_PRECISION, // $1
      reduceOnly: true,
      auctionDuration: 0,
    });
    console.log('SUCCESS! TX:', txSig);
  } catch(e) {
    const msg = e.message || '';
    console.log('FAILED:', msg);
    if (e.logs) {
      console.log('\nFull logs:');
      for (const log of e.logs) {
        console.log(' ', log);
      }
    }
    if (e.simulationResponse) {
      console.log('\nSimulation logs:');
      for (const log of (e.simulationResponse.logs || [])) {
        console.log(' ', log);
      }
    }
  }

  // Try even smaller: 0.1 SOL  
  console.log('\n--- LIMIT SHORT 0.1 SOL at $1 ---');
  try {
    const txSig = await maker.placeAndTakePerpOrder({
      orderType: OrderType.LIMIT,
      marketIndex: 0,
      direction: PositionDirection.SHORT,
      baseAssetAmount: BASE_PRECISION.div(new BN(10)), // 0.1 SOL
      price: PRICE_PRECISION, // $1
      reduceOnly: true,
      auctionDuration: 0,
    });
    console.log('SUCCESS! TX:', txSig);
  } catch(e) {
    const msg = e.message || '';
    console.log('FAILED:', msg);
    if (e.logs) {
      console.log('\nFull logs:');
      for (const log of e.logs) {
        console.log(' ', log);
      }
    }
  }

  await restoreAndExit(admin, maker);
}

async function restoreAndExit(admin, maker) {
  console.log('\n=== RESTORING SETTINGS ===');
  try { await admin.updatePerpMarketCurveUpdateIntensity(0, 100); console.log('intensity -> 100'); } catch(e) { console.log('err:', e.message.slice(0,60)); }
  try { await admin.updatePerpMarketMarginRatio(0, 5000, 2500); console.log('margin -> 5000/2500'); } catch(e) { console.log('err:', e.message.slice(0,60)); }
  try {
    await admin.updateOracleGuardRails({
      priceDivergence: { markOraclePercentDivergence: new BN(100000), oracleTwap5MinPercentDivergence: new BN(500000) },
      validity: { slotsBeforeStaleForAmm: new BN(36000), slotsBeforeStaleForMargin: new BN(120), confidenceIntervalMaxSize: new BN(1000000), tooVolatileRatio: new BN(5) },
    });
    console.log('guard rails -> 10%/50%');
  } catch(e) { console.log('err:', e.message.slice(0,60)); }
  
  await admin.unsubscribe();
  await maker.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
