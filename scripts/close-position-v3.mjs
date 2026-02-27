import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, BASE_PRECISION, 
  PositionDirection, OrderType, BN } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const RPC = 'https://api.devnet.solana.com';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  
  // Only need maker for this - AMM is centered, no need to widen bands
  const makerKp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(
    fs.readFileSync('/home/gorcore/Drift-Clone/keys/maker-keypair.json')
  )));
  const makerWallet = new Wallet(makerKp);
  
  const cfg = initialize({ env: 'devnet' });
  cfg.DRIFT_PROGRAM_ID = PROGRAM_ID;
  
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');
  
  const maker = new DriftClient({
    connection: conn,
    wallet: makerWallet,
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
    txParams: { computeUnitsPrice: 50000 },
  });
  
  // Use polling subscription to get fresh data
  await maker.subscribe();
  await new Promise(r => setTimeout(r, 5000));
  
  // Cancel any open orders first
  console.log('Cancelling all orders...');
  try {
    await maker.cancelOrders();
    console.log('Orders cancelled');
  } catch(e) {
    console.log('No orders to cancel or error:', e.message);
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Fetch fresh account state
  await maker.fetchAccounts();
  await new Promise(r => setTimeout(r, 2000));
  
  const user = maker.getUser();
  const positions = user.getUserAccount().perpPositions;
  const pos = positions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  
  if (!pos) {
    console.log('No position found! Already closed.');
    await maker.unsubscribe();
    process.exit(0);
  }
  
  const totalBase = pos.baseAssetAmount;
  const totalSol = totalBase.toNumber() / BASE_PRECISION.toNumber();
  console.log('Current position:', totalSol > 0 ? 'LONG' : 'SHORT', Math.abs(totalSol).toFixed(4), 'SOL');
  
  if (totalSol <= 0) {
    console.log('Position is short or zero, nothing to close with SHORT orders.');
    await maker.unsubscribe();
    process.exit(0);
  }
  
  // Close in chunks of 5 SOL
  const CHUNK = 5;
  const chunkBase = new BN(CHUNK).mul(BASE_PRECISION);
  let remaining = Math.abs(totalSol);
  let chunkNum = 0;
  
  while (remaining > 0.01) {
    chunkNum++;
    const thisChunk = remaining >= CHUNK ? chunkBase : new BN(Math.floor(remaining * 1e9)).mul(new BN(1000));
    const thisChunkSol = Number(thisChunk.toString()) / BASE_PRECISION.toNumber();
    
    console.log(`\nChunk ${chunkNum}: Closing ${thisChunkSol.toFixed(4)} SOL...`);
    
    try {
      const txSig = await maker.placeAndTakePerpOrder({
        orderType: OrderType.MARKET,
        marketIndex: 0, 
        direction: PositionDirection.SHORT,
        baseAssetAmount: thisChunk,
        reduceOnly: true,
      });
      
      console.log(`  TX: ${txSig}`);
      
      // Wait for confirmation
      await new Promise(r => setTimeout(r, 3000));
      
      // Fetch fresh state to verify
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
          console.log('  WARNING: Position did not decrease! Fill may have failed.');
          console.log('  Checking transaction on-chain...');
          
          // Check the tx to see what happened
          const txInfo = await conn.getTransaction(txSig, { maxSupportedTransactionVersion: 0 });
          if (txInfo && txInfo.meta) {
            if (txInfo.meta.err) {
              console.log('  TX ERROR:', JSON.stringify(txInfo.meta.err));
            } else {
              console.log('  TX succeeded but no position change - order likely not filled');
              console.log('  Log messages:', txInfo.meta.logMessages?.slice(-5));
            }
          }
          // Try once more with a slight delay, then break
          console.log('  Retrying after delay...');
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }
        
        remaining = Math.abs(newSol);
      }
    } catch(e) {
      console.log(`  ERROR: ${e.message}`);
      if (e.logs) {
        const relevant = e.logs.filter(l => l.includes('Error') || l.includes('error') || l.includes('Custom'));
        console.log('  Relevant logs:', relevant);
      }
      // Wait and retry
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  console.log('\nDone! Final position check...');
  await maker.fetchAccounts();
  const finalPos = maker.getUser().getUserAccount().perpPositions
    .find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  if (finalPos) {
    const sol = finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
    console.log('Final position:', Math.abs(sol).toFixed(4), 'SOL');
  } else {
    console.log('Position fully closed!');
  }
  
  await maker.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
