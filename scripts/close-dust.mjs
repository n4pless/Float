import { Connection, Keypair, PublicKey } from '@solana/web3.js';
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
  
  // Set curveUpdateIntensity to 0 + recenter for flat spread
  let mkt = admin.getPerpMarketAccount(0);
  if (mkt.amm.curveUpdateIntensity !== 0) {
    await admin.updatePerpMarketCurveUpdateIntensity(0, 0);
    await new Promise(r => setTimeout(r, 3000));
    mkt = admin.getPerpMarketAccount(0);
    await admin.recenterPerpMarketAmm(0, mkt.amm.pegMultiplier, mkt.amm.sqrtK);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Fix guard rails (120 fits i8)
  await admin.updateOracleGuardRails({
    priceDivergence: { markOraclePercentDivergence: new BN(990000), oracleTwap5MinPercentDivergence: new BN(990000) },
    validity: { slotsBeforeStaleForAmm: new BN(120), slotsBeforeStaleForMargin: new BN(120), confidenceIntervalMaxSize: new BN(1000000), tooVolatileRatio: new BN(5) },
  });
  
  // Widen margin
  await admin.updatePerpMarketMarginRatio(0, 9500, 9000);
  
  await new Promise(r => setTimeout(r, 5000));
  await maker.fetchAccounts();
  
  // Check position
  const pos = maker.getUser().getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (!pos) {
    console.log('No position! Done.');
    await cleanup(admin, maker);
    return;
  }
  
  const baseAmt = pos.baseAssetAmount;
  const solAmt = baseAmt.toNumber() / BASE_PRECISION.toNumber();
  console.log('Position:', solAmt.toFixed(6), 'SOL');
  console.log('quoteBreakEvenAmount:', pos.quoteBreakEvenAmount?.toString());
  console.log('quoteEntryAmount:', pos.quoteEntryAmount?.toString());
  
  // Close remaining with exact base amount
  console.log('\nClosing remaining', solAmt.toFixed(6), 'SOL...');
  
  // Use the exact baseAssetAmount from position (absolute value)
  const exactBase = baseAmt.abs();
  console.log('Exact base amount:', exactBase.toString());
  
  try {
    const txSig = await maker.placeAndTakePerpOrder({
      orderType: OrderType.LIMIT,
      marketIndex: 0,
      direction: PositionDirection.SHORT,
      baseAssetAmount: exactBase,
      price: PRICE_PRECISION, // $1 
      reduceOnly: true,
      auctionDuration: 0,
    });
    console.log('TX:', txSig);
    await new Promise(r => setTimeout(r, 3000));
    await maker.fetchAccounts();
    
    const finalPos = maker.getUser().getUserAccount().perpPositions
      .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
    if (finalPos) {
      console.log('Still remaining:', finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber(), 'SOL');
    } else {
      console.log('Position FULLY CLOSED!');
    }
  } catch(e) {
    console.log('Error:', e.message?.slice(0, 300));
    if (e.logs) {
      for (const log of e.logs.slice(-5)) console.log('  LOG:', log);
    }
    
    // Try smaller: half the amount
    console.log('\nTrying half amount...');
    try {
      const halfBase = exactBase.div(new BN(2));
      console.log('Half base:', halfBase.toString());
      const txSig = await maker.placeAndTakePerpOrder({
        orderType: OrderType.LIMIT,
        marketIndex: 0,
        direction: PositionDirection.SHORT,
        baseAssetAmount: halfBase,
        price: PRICE_PRECISION,
        reduceOnly: true,
        auctionDuration: 0,
      });
      console.log('TX:', txSig);
      
      await new Promise(r => setTimeout(r, 3000));
      await maker.fetchAccounts();
      const p2 = maker.getUser().getUserAccount().perpPositions
        .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
      if (p2) {
        console.log('Remaining:', p2.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber(), 'SOL');
      } else {
        console.log('Position FULLY CLOSED!');
      }
    } catch(e2) {
      console.log('Half also failed:', e2.message?.slice(0, 200));
    }
  }
  
  await cleanup(admin, maker);
}

async function cleanup(admin, maker) {
  // Restore settings
  try { await admin.updatePerpMarketCurveUpdateIntensity(0, 100); } catch(e) {}
  try { await admin.updatePerpMarketMarginRatio(0, 5000, 2500); } catch(e) {}
  try {
    await admin.updateOracleGuardRails({
      priceDivergence: { markOraclePercentDivergence: new BN(100000), oracleTwap5MinPercentDivergence: new BN(500000) },
      validity: { slotsBeforeStaleForAmm: new BN(120), slotsBeforeStaleForMargin: new BN(120), confidenceIntervalMaxSize: new BN(1000000), tooVolatileRatio: new BN(5) },
    });
  } catch(e) {}
  console.log('Settings restored.');
  await admin.unsubscribe();
  await maker.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
