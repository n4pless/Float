import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, BASE_PRECISION, PRICE_PRECISION,
  PositionDirection, OrderType, BN } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const RPC = 'https://api.devnet.solana.com';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  
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
  
  await maker.subscribe();
  await new Promise(r => setTimeout(r, 5000));
  
  // Cancel any open orders first
  console.log('Cancelling all orders...');
  try { await maker.cancelOrders(); } catch(e) { console.log('Cancel:', e.message); }
  await new Promise(r => setTimeout(r, 2000));
  
  // Check current position
  await maker.fetchAccounts();
  const user = maker.getUser();
  const pos = user.getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  
  if (!pos) {
    console.log('No position! Already closed.');
    await maker.unsubscribe();
    process.exit(0);
  }
  
  const totalSol = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('Current position:', totalSol > 0 ? 'LONG' : 'SHORT', Math.abs(totalSol).toFixed(4), 'SOL');
  
  if (totalSol <= 0) {
    console.log('Not a long position. Exiting.');
    await maker.unsubscribe();
    process.exit(0);
  }
  
  // Use LIMIT SHORT at $1 (crosses AMM bid of ~$12)
  // This ensures the taker price ($1) < AMM bid ($12), so orders cross
  const limitPrice = PRICE_PRECISION; // $1 in PRICE_PRECISION
  
  const CHUNK = 5;
  const chunkBase = new BN(CHUNK).mul(BASE_PRECISION);
  let remaining = Math.abs(totalSol);
  let chunkNum = 0;
  let consecutiveFails = 0;
  
  while (remaining > 0.01 && consecutiveFails < 3) {
    chunkNum++;
    const thisChunk = remaining >= CHUNK ? chunkBase : new BN(Math.floor(remaining * 1e9)).mul(new BN(1000));
    const thisChunkSol = Number(thisChunk.toString()) / BASE_PRECISION.toNumber();
    
    console.log(`\nChunk ${chunkNum}: Closing ${thisChunkSol.toFixed(4)} SOL with LIMIT SHORT @ $1...`);
    
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
      
      console.log(`  TX: ${txSig}`);
      
      // Wait for confirmation and fetch fresh state
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
          
          // Check tx logs
          const txInfo = await conn.getTransaction(txSig, { maxSupportedTransactionVersion: 0 });
          if (txInfo?.meta?.logMessages) {
            const relevant = txInfo.meta.logMessages.filter(l => 
              l.includes('cross') || l.includes('error') || l.includes('Error') || l.includes('fulfillment') || l.includes('price')
            );
            if (relevant.length > 0) console.log('  Logs:', relevant);
          }
        } else {
          consecutiveFails = 0;
          remaining = Math.abs(newSol);
        }
      }
    } catch(e) {
      console.log(`  ERROR: ${e.message}`);
      consecutiveFails++;
      if (e.logs) {
        const relevant = e.logs.filter(l => l.includes('Error') || l.includes('error') || l.includes('Custom') || l.includes('cross'));
        if (relevant.length > 0) console.log('  Relevant logs:', relevant);
      }
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
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
  
  await maker.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
