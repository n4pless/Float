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
  
  // Get current curve_update_intensity
  let mkt = admin.getPerpMarketAccount(0);
  const originalCurveUpdateIntensity = mkt.amm.curveUpdateIntensity;
  console.log('Original curveUpdateIntensity:', originalCurveUpdateIntensity);
  
  // Step 1: Set curveUpdateIntensity to 0 (disables complex spread calculation)
  // With intensity=0, spread = base_spread/2 on each side (~0.005%)
  console.log('\nStep 1: Setting curveUpdateIntensity to 0 (flat spread)...');
  try {
    const tx1 = await admin.updatePerpMarketCurveUpdateIntensity(0, 0);
    console.log('  Done:', tx1.slice(0, 12) + '...');
  } catch(e) {
    console.log('  Error:', e.message.slice(0, 80));
  }
  
  // Step 1b: Force update_spreads by calling recenterPerpMarketAmm
  // This makes the stored longSpread/shortSpread reflect curveUpdateIntensity=0
  console.log('Step 1b: Recentering AMM to trigger spread update...');
  try {
    mkt = admin.getPerpMarketAccount(0);
    const currentPeg = mkt.amm.pegMultiplier;
    const currentSqrtK = mkt.amm.sqrtK;
    console.log('  Using peg:', currentPeg.toString(), 'sqrtK:', currentSqrtK.toString());
    const txR = await admin.recenterPerpMarketAmm(0, currentPeg, currentSqrtK);
    console.log('  Recentered:', txR.slice(0, 12) + '...');
  } catch(e) {
    console.log('  Recenter error:', e.message.slice(0, 120));
  }
  
  // Step 2: Widen margin ratio and guard rails
  console.log('Step 2: Widening price bands...');
  try {
    await admin.updatePerpMarketMarginRatio(0, 9500, 2500);
    console.log('  Margin -> 9500');
  } catch(e) { console.log('  Error:', e.message.slice(0, 80)); }
  
  try {
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
    console.log('  Guard rails -> 99%');
  } catch(e) { console.log('  Error:', e.message.slice(0, 80)); }
  
  // Wait for all changes to propagate
  await new Promise(r => setTimeout(r, 8000));
  await admin.fetchAccounts();
  await maker.fetchAccounts();
  await new Promise(r => setTimeout(r, 2000));
  
  // Verify
  mkt = admin.getPerpMarketAccount(0);
  console.log('  Verified curveUpdateIntensity:', mkt.amm.curveUpdateIntensity);
  console.log('  Verified marginRatioInitial:', mkt.marginRatioInitial);
  console.log('  Verified longSpread:', mkt.amm.longSpread, 'shortSpread:', mkt.amm.shortSpread);
  
  // Step 3: Cancel maker orders
  console.log('\nStep 3: Cancelling maker orders...');
  try { await maker.cancelOrders(); } catch(e) {}
  await new Promise(r => setTimeout(r, 2000));
  
  // Check position
  await maker.fetchAccounts();
  const pos = maker.getUser().getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (!pos) {
    console.log('No position! Restoring settings and exiting.');
    await restoreSettings(admin, originalCurveUpdateIntensity);
    await admin.unsubscribe();
    await maker.unsubscribe();
    process.exit(0);
  }
  
  const totalSol = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('Position:', totalSol > 0 ? 'LONG' : 'SHORT', Math.abs(totalSol).toFixed(4), 'SOL');
  
  // Step 4: Close with LIMIT SHORT at $10
  const limitPrice = PRICE_PRECISION.mul(new BN(10));
  const CHUNK = 2;
  const chunkBase = new BN(CHUNK).mul(BASE_PRECISION);
  let remaining = Math.abs(totalSol);
  let chunkNum = 0;
  let consecutiveFails = 0;
  
  while (remaining > 0.01 && consecutiveFails < 5) {
    chunkNum++;
    const thisChunk = remaining >= CHUNK ? chunkBase : new BN(Math.floor(remaining * 1e9)).mul(new BN(1000));
    const thisChunkSol = Number(thisChunk.toString()) / BASE_PRECISION.toNumber();
    
    console.log(`\nChunk ${chunkNum}: ${thisChunkSol.toFixed(4)} SOL...`);
    
    try {
      const txSig = await maker.placeAndTakePerpOrder({
        orderType: OrderType.LIMIT,
        marketIndex: 0, 
        direction: PositionDirection.SHORT,
        baseAssetAmount: thisChunk,
        price: limitPrice,
        reduceOnly: true,
        auctionDuration: 0,
      });
      
      console.log(`  TX: ${txSig.slice(0, 20)}...`);
      await new Promise(r => setTimeout(r, 3000));
      await maker.fetchAccounts();
      await new Promise(r => setTimeout(r, 1000));
      
      const updatedPos = maker.getUser().getUserAccount().perpPositions
        .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
      
      if (!updatedPos) {
        console.log('  Position fully closed!');
        remaining = 0;
      } else {
        const newSol = updatedPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
        console.log(`  Remaining: ${Math.abs(newSol).toFixed(4)} SOL`);
        if (Math.abs(newSol) >= remaining - 0.001) {
          console.log('  WARNING: No decrease!');
          consecutiveFails++;
        } else {
          consecutiveFails = 0;
          remaining = Math.abs(newSol);
        }
      }
    } catch(e) {
      const msg = e.message || '';
      console.log(`  ERROR: ${msg.slice(0, 150)}`);
      consecutiveFails++;
      // Extract error code
      const codeMatch = msg.match(/0x([0-9a-fA-F]+)/);
      if (codeMatch) {
        const code = parseInt(codeMatch[1], 16);
        console.log(`  Error code: ${code} (0x${codeMatch[1]})`);
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Step 5: Restore all settings
  await restoreSettings(admin, originalCurveUpdateIntensity);
  
  // Final status
  console.log('\n=== FINAL STATUS ===');
  await maker.fetchAccounts();
  const finalPos = maker.getUser().getUserAccount().perpPositions
    .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (finalPos) {
    const sol = finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
    console.log('Remaining position:', Math.abs(sol).toFixed(4), 'SOL');
  } else {
    console.log('Position fully closed!');
  }
  
  await admin.unsubscribe();
  await maker.unsubscribe();
  process.exit(0);
}

async function restoreSettings(admin, originalIntensity) {
  console.log('\nRestoring settings...');
  try {
    await admin.updatePerpMarketCurveUpdateIntensity(0, originalIntensity);
    console.log('  curveUpdateIntensity ->', originalIntensity);
  } catch(e) { console.log('  Error restoring intensity:', e.message.slice(0, 60)); }
  
  try {
    await admin.updatePerpMarketMarginRatio(0, 5000, 2500);
    console.log('  marginRatio -> 5000/2500');
  } catch(e) { console.log('  Error restoring margin:', e.message.slice(0, 60)); }
  
  try {
    await admin.updateOracleGuardRails({
      priceDivergence: {
        markOraclePercentDivergence: new BN(100000),
        oracleTwap5MinPercentDivergence: new BN(500000),
      },
      validity: {
        slotsBeforeStaleForAmm: new BN(36000),
        slotsBeforeStaleForMargin: new BN(120),
        confidenceIntervalMaxSize: new BN(1000000),
        tooVolatileRatio: new BN(5),
      },
    });
    console.log('  Guard rails -> 10%/50%');
  } catch(e) { console.log('  Error restoring guard rails:', e.message.slice(0, 60)); }
}

main().catch(e => { console.error(e); process.exit(1); });
