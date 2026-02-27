import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AdminClient, DriftClient, Wallet, OracleSource, initialize, getMarketsAndOraclesForSubscription, 
  getPrelaunchOraclePublicKey, BASE_PRECISION, PRICE_PRECISION, PositionDirection, OrderType, BN } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const RPC = 'https://api.devnet.solana.com';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  
  // Load keypairs
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
  
  // Admin client
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
  
  // Maker client
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
  
  // Step 1: Admin widens margin_ratio_initial to 9500 (95%) to allow fills at wide spreads
  console.log('Step 1: Widening price bands (margin_ratio_initial -> 9500)...');
  try {
    const tx1 = await admin.updatePerpMarketMarginRatio(0, 9500, 2500);
    console.log('  Margin widened:', tx1.slice(0, 12) + '...');
  } catch(e) {
    console.log('  Margin widen error:', e.message.slice(0, 80));
  }
  
  // Also widen oracle guard rails (oracleTwap5MinPercentDivergence check also blocks)
  console.log('Step 1b: Widening oracle guard rails...');
  try {
    const tx1b = await admin.updateOracleGuardRails({
      priceDivergence: {
        markOraclePercentDivergence: new BN(990000),      // 99%
        oracleTwap5MinPercentDivergence: new BN(990000),  // 99%
      },
      validity: {
        slotsBeforeStaleForAmm: new BN(36000),
        slotsBeforeStaleForMargin: new BN(120),
        confidenceIntervalMaxSize: new BN(1000000),
        tooVolatileRatio: new BN(5),
      },
    });
    console.log('  Guard rails widened:', tx1b.slice(0, 12) + '...');
  } catch(e) {
    console.log('  Guard rails error:', e.message.slice(0, 80));
  }
  
  // Wait for confirmation and refresh accounts
  await new Promise(r => setTimeout(r, 8000));
  await admin.fetchAccounts();
  await maker.fetchAccounts();
  await new Promise(r => setTimeout(r, 2000));
  
  // Verify
  const mkt = admin.getPerpMarketAccount(0);
  console.log('  Verified margin_ratio_initial:', mkt.marginRatioInitial);
  const st = admin.getStateAccount();
  console.log('  Verified oracleTwap5MinPercentDivergence:', st.oracleGuardRails.priceDivergence.oracleTwap5MinPercentDivergence.toString());
  
  // Step 2: Cancel any maker orders
  console.log('Step 2: Cancelling maker orders...');
  try { await maker.cancelOrders(); } catch(e) { console.log('  Cancel:', e.message.slice(0, 40)); }
  await new Promise(r => setTimeout(r, 2000));
  
  // Refresh maker's view of the market
  await maker.fetchAccounts();
  await new Promise(r => setTimeout(r, 2000));
  
  // Step 3: Check position
  await maker.fetchAccounts();
  const user = maker.getUser();
  const pos = user.getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  
  if (!pos) {
    console.log('No position! Already closed.');
    // Restore margin
    await admin.updatePerpMarketMarginRatio(0, 5000, 2500);
    await admin.unsubscribe();
    await maker.unsubscribe();
    process.exit(0);
  }
  
  const totalSol = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('Current position:', totalSol > 0 ? 'LONG' : 'SHORT', Math.abs(totalSol).toFixed(4), 'SOL');
  
  // Step 4: Close in chunks using LIMIT SHORT at $10 (crosses AMM bid ~$12)
  const limitPrice = PRICE_PRECISION.mul(new BN(10)); // $10
  const CHUNK = 2; // Smaller chunks to reduce impact
  const chunkBase = new BN(CHUNK).mul(BASE_PRECISION);
  let remaining = Math.abs(totalSol);
  let chunkNum = 0;
  let consecutiveFails = 0;
  
  while (remaining > 0.01 && consecutiveFails < 3) {
    chunkNum++;
    const thisChunk = remaining >= CHUNK ? chunkBase : new BN(Math.floor(remaining * 1e9)).mul(new BN(1000));
    const thisChunkSol = Number(thisChunk.toString()) / BASE_PRECISION.toNumber();
    
    console.log(`\nChunk ${chunkNum}: Closing ${thisChunkSol.toFixed(4)} SOL (LIMIT SHORT @ $10)...`);
    
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
      
      // Wait and fetch fresh state
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
          console.log('  WARNING: Position did not decrease!');
          consecutiveFails++;
        } else {
          consecutiveFails = 0;
          remaining = Math.abs(newSol);
        }
      }
    } catch(e) {
      const msg = e.message || '';
      console.log(`  ERROR: ${msg.slice(0, 120)}`);
      if (msg.includes('PriceBands')) {
        console.log('  Still hitting price bands - need wider margin');
        consecutiveFails++;
      } else {
        consecutiveFails++;
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Step 5: Restore margin ratio and guard rails
  console.log('\nStep 5: Restoring margin and guard rails...');
  try {
    await admin.updatePerpMarketMarginRatio(0, 5000, 2500);
    console.log('  Margin restored to 5000');
  } catch(e) {
    console.log('  Margin restore error:', e.message.slice(0, 80));
  }
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
    console.log('  Guard rails restored');
  } catch(e) {
    console.log('  Guard rails restore error:', e.message.slice(0, 80));
  }
  
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

main().catch(e => { console.error(e); process.exit(1); });
