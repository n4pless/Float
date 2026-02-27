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
  
  // Step 1: Set curveUpdateIntensity to 0 (flat spread)
  let mkt = admin.getPerpMarketAccount(0);
  const origIntensity = mkt.amm.curveUpdateIntensity;
  console.log('curveUpdateIntensity:', origIntensity, 'longSpread:', mkt.amm.longSpread, 'shortSpread:', mkt.amm.shortSpread);
  
  if (origIntensity !== 0) {
    console.log('Setting curveUpdateIntensity to 0...');
    await admin.updatePerpMarketCurveUpdateIntensity(0, 0);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  // Step 2: Recenter to trigger flat spread update
  console.log('Recentering AMM...');
  mkt = admin.getPerpMarketAccount(0);
  await admin.recenterPerpMarketAmm(0, mkt.amm.pegMultiplier, mkt.amm.sqrtK);
  await new Promise(r => setTimeout(r, 3000));
  
  // Step 3: Reset oracle TWAPs
  console.log('Resetting oracle TWAPs...');
  mkt = admin.getPerpMarketAccount(0);
  const priceBN = new BN(mkt.amm.historicalOracleData.lastOraclePrice.toString());
  try {
    await admin.updatePrelaunchOracleParams(0, priceBN, new BN(1000).mul(PRICE_PRECISION));
    console.log('  Oracle TWAPs reset to price:', priceBN.toNumber() / 1e6);
  } catch(e) { console.log('  Oracle reset err:', e.message?.slice(0, 120)); }
  
  // Step 4: Widen margin ratio
  console.log('Widening margin to 9500...');
  await admin.updatePerpMarketMarginRatio(0, 9500, 2500);
  
  // Step 5: FIX GUARD RAILS - slotsBeforeStaleForAmm must fit in i8 (max 127)!
  // Previous scripts used 36000 which caused CastingFailure on oracle.rs:272 cast to i8
  console.log('Setting guard rails (slotsBeforeStaleForAmm=120, fits i8)...');
  await admin.updateOracleGuardRails({
    priceDivergence: {
      markOraclePercentDivergence: new BN(990000),   // 99%
      oracleTwap5MinPercentDivergence: new BN(990000), // 99%
    },
    validity: {
      slotsBeforeStaleForAmm: new BN(120),  // 120 slots = ~60 seconds, fits in i8!
      slotsBeforeStaleForMargin: new BN(120),
      confidenceIntervalMaxSize: new BN(1000000),
      tooVolatileRatio: new BN(5),
    },
  });
  console.log('  Guard rails set (120 slots)');
  
  // Wait for propagation
  await new Promise(r => setTimeout(r, 8000));
  await admin.fetchAccounts();
  await maker.fetchAccounts();
  
  // Verify state
  mkt = admin.getPerpMarketAccount(0);
  console.log('\n=== STATE ===');
  console.log('curveUpdateIntensity:', mkt.amm.curveUpdateIntensity);
  console.log('longSpread:', mkt.amm.longSpread, 'shortSpread:', mkt.amm.shortSpread);
  console.log('marginRatioInitial:', mkt.marginRatioInitial);
  
  // Check position
  const pos = maker.getUser().getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (!pos) {
    console.log('No position! Done.');
    await restore(admin, origIntensity);
    return;
  }
  
  let remaining = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('Position: LONG', remaining.toFixed(4), 'SOL');
  
  // Step 6: Close in chunks using LIMIT SHORT at $1
  const CHUNK = 2;
  let fails = 0;
  let chunkNum = 0;
  
  while (remaining > 0.01 && fails < 3) {
    chunkNum++;
    const chunkAmt = remaining >= CHUNK 
      ? new BN(CHUNK).mul(BASE_PRECISION)
      : new BN(Math.floor(remaining * 1e9)).mul(new BN(1000));
    const chunkSol = Number(chunkAmt.toString()) / BASE_PRECISION.toNumber();
    
    process.stdout.write(`Chunk ${chunkNum}: ${chunkSol.toFixed(4)} SOL... `);
    
    try {
      const txSig = await maker.placeAndTakePerpOrder({
        orderType: OrderType.LIMIT,
        marketIndex: 0,
        direction: PositionDirection.SHORT,
        baseAssetAmount: chunkAmt,
        price: PRICE_PRECISION, // $1 limit
        reduceOnly: true,
        auctionDuration: 0,
      });
      
      await new Promise(r => setTimeout(r, 3000));
      await maker.fetchAccounts();
      
      const updPos = maker.getUser().getUserAccount().perpPositions
        .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
      
      if (!updPos) {
        console.log('CLOSED! Position fully closed!');
        remaining = 0;
      } else {
        const newRemaining = updPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
        if (newRemaining >= remaining - 0.001) {
          console.log('NO DECREASE! Still', newRemaining.toFixed(4));
          fails++;
        } else {
          console.log('OK! Remaining:', newRemaining.toFixed(4));
          remaining = newRemaining;
          fails = 0;
        }
      }
    } catch(e) {
      const msg = e.message || '';
      console.log('ERROR:', msg.slice(0, 200));
      if (e.logs) {
        for (const log of e.logs.slice(-5)) {
          console.log('  LOG:', log);
        }
      }
      fails++;
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Restore
  await restore(admin, origIntensity);
  
  // Final status
  await maker.fetchAccounts();
  const finalPos = maker.getUser().getUserAccount().perpPositions
    .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (finalPos) {
    const sol = finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
    console.log('\nFinal remaining:', Math.abs(sol).toFixed(4), 'SOL');
  } else {
    console.log('\nPosition FULLY CLOSED!');
  }
  
  await admin.unsubscribe();
  await maker.unsubscribe();
  process.exit(0);
}

async function restore(admin, origIntensity) {
  console.log('\nRestoring settings...');
  try { await admin.updatePerpMarketCurveUpdateIntensity(0, origIntensity); console.log('  intensity ->', origIntensity); } catch(e) { console.log('  intensity err:', e.message?.slice(0,60)); }
  try { await admin.updatePerpMarketMarginRatio(0, 5000, 2500); console.log('  margin -> 5000/2500'); } catch(e) { console.log('  margin err:', e.message?.slice(0,60)); }
  try {
    await admin.updateOracleGuardRails({
      priceDivergence: { markOraclePercentDivergence: new BN(100000), oracleTwap5MinPercentDivergence: new BN(500000) },
      validity: { slotsBeforeStaleForAmm: new BN(120), slotsBeforeStaleForMargin: new BN(120), confidenceIntervalMaxSize: new BN(1000000), tooVolatileRatio: new BN(5) },
    });
    console.log('  guard rails -> 10%/50% (120 slots)');
  } catch(e) { console.log('  guard rails err:', e.message?.slice(0,60)); }
}

main().catch(e => { console.error(e); process.exit(1); });
