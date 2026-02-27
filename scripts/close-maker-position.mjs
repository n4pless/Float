// close-maker-position.mjs
// Closes the maker's open perp position on market 0 (SOL-PERP)
import { Connection, Keypair } from '@solana/web3.js';
import {
  DriftClient,
  Wallet,
  PositionDirection,
  OrderType,
  BASE_PRECISION,
  BN,
  initialize,
  getMarketsAndOraclesForSubscription,
} from '@drift-labs/sdk';
import fs from 'fs';

const RPC_URL = process.env.RPC_URL || 'https://api.devnet.solana.com';
const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/maker-keypair.json';

async function main() {
  console.log('Connecting to', RPC_URL);
  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  const keypairData = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);
  console.log('Maker wallet:', wallet.publicKey.toBase58());

  // Override SDK config for our custom program
  const sdkConfig = initialize({ env: 'devnet' });
  sdkConfig.DRIFT_PROGRAM_ID = PROGRAM_ID;

  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription('devnet');

  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new (await import('@solana/web3.js')).PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
  });

  await driftClient.subscribe();
  console.log('DriftClient subscribed');

  // Check current position
  const user = driftClient.getUser();
  const perpPositions = user.getUserAccount().perpPositions;
  
  const market0Position = perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  
  if (!market0Position) {
    console.log('No open position on market 0. Nothing to close.');
    await driftClient.unsubscribe();
    process.exit(0);
  }

  const baseAmount = market0Position.baseAssetAmount;
  const isLong = baseAmount.gt(new BN(0));
  const absBase = isLong ? baseAmount : baseAmount.neg();
  const solAmount = absBase.toNumber() / BASE_PRECISION.toNumber();
  
  console.log(`Current position: ${isLong ? 'LONG' : 'SHORT'} ${solAmount.toFixed(4)} SOL`);

  // First cancel all open orders
  console.log('Cancelling all open orders...');
  const openOrders = user.getOpenOrders();
  for (const order of openOrders) {
    if (order.marketIndex === 0) {
      try {
        const tx = await driftClient.cancelOrder(order.orderId);
        console.log(`Cancelled order ${order.orderId}: ${tx}`);
      } catch (e) {
        console.log(`Failed to cancel order ${order.orderId}: ${e.message}`);
      }
    }
  }

  // Close position using market order in the opposite direction
  const closeDirection = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
  
  // Close in chunks to avoid price bands issues
  const chunkSize = BASE_PRECISION.mul(new BN(5)); // 5 SOL per chunk
  let remaining = absBase;
  let chunkNum = 0;

  while (remaining.gt(new BN(0))) {
    const thisChunk = remaining.gt(chunkSize) ? chunkSize : remaining;
    chunkNum++;
    
    console.log(`\nClosing chunk ${chunkNum}: ${thisChunk.toNumber() / BASE_PRECISION.toNumber()} SOL (${remaining.toNumber() / BASE_PRECISION.toNumber()} remaining)`);
    
    try {
      // Place a market order to close
      const tx = await driftClient.placePerpOrder({
        marketIndex: 0,
        orderType: OrderType.MARKET,
        direction: closeDirection,
        baseAssetAmount: thisChunk,
        reduceOnly: true,
      });
      console.log(`Placed close order: ${tx}`);
      
      // Wait a bit for it to process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      remaining = remaining.sub(thisChunk);
    } catch (e) {
      console.log(`Error closing chunk: ${e.message}`);
      
      // If market order fails, try with oracle price offset
      try {
        console.log('Trying with limit order at oracle price...');
        const oracleData = driftClient.getOracleDataForPerpMarket(0);
        const tx = await driftClient.placePerpOrder({
          marketIndex: 0,
          orderType: OrderType.LIMIT,
          direction: closeDirection,
          baseAssetAmount: thisChunk,
          reduceOnly: true,
          oraclePriceOffset: isLong ? 0 : 0, // at oracle price
        });
        console.log(`Placed limit close order: ${tx}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        remaining = remaining.sub(thisChunk);
      } catch (e2) {
        console.log(`Limit order also failed: ${e2.message}`);
        console.log('Stopping - manual intervention may be needed');
        break;
      }
    }
  }

  // Check final position
  const finalPos = user.getUserAccount().perpPositions.find(p => p.marketIndex === 0);
  if (finalPos && !finalPos.baseAssetAmount.isZero()) {
    const finalSol = finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
    console.log(`\nFinal position: ${finalSol.toFixed(4)} SOL (may need filler to execute)`);
  } else {
    console.log('\nPosition fully closed!');
  }

  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
