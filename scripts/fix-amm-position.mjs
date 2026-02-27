// fix-amm-position.mjs
// Uses admin to widen price bands, close maker's position, then restore bands
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  AdminClient,
  Wallet,
  PositionDirection,
  OrderType,
  BASE_PRECISION,
  BN,
  initialize,
  getMarketsAndOraclesForSubscription,
} from '@drift-labs/sdk';
import fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const ADMIN_KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';
const MAKER_KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/maker-keypair.json';

async function createClient(keypairPath, connection) {
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);
  console.log('Wallet:', wallet.publicKey.toBase58());

  const sdkConfig = initialize({ env: 'devnet' });
  sdkConfig.DRIFT_PROGRAM_ID = PROGRAM_ID;

  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } =
    getMarketsAndOraclesForSubscription('devnet');

  const client = new AdminClient({
    connection,
    wallet,
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes,
    spotMarketIndexes,
    oracleInfos,
  });

  await client.subscribe();
  return client;
}

async function main() {
  console.log('=== AMM Position Fix Script ===\n');
  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  // Step 1: Connect as admin and widen price bands
  console.log('Step 1: Connecting as admin to widen price bands...');
  const adminClient = await createClient(ADMIN_KEYPAIR_PATH, connection);

  // Get current oracle guard rails
  const state = adminClient.getStateAccount();
  const currentGuardRails = state.oracleGuardRails;
  console.log('Current oracle guard rails:');
  console.log('  markOraclePercentDivergence:', currentGuardRails.priceDivergence.markOraclePercentDivergence.toString());
  console.log('  oracleTwap5MinPercentDivergence:', currentGuardRails.priceDivergence.oracleTwap5MinPercentDivergence.toString());

  // Widen price divergence to 99% (9900 basis points) temporarily
  const widenedGuardRails = {
    priceDivergence: {
      markOraclePercentDivergence: new BN(9900), // 99%
      oracleTwap5MinPercentDivergence: new BN(9900), // 99%
    },
    validity: currentGuardRails.validity,
  };

  try {
    const tx1 = await adminClient.updateOracleGuardRails(widenedGuardRails);
    console.log('Widened price bands:', tx1);
  } catch (e) {
    console.log('Failed to widen price bands:', e.message);
    await adminClient.unsubscribe();
    process.exit(1);
  }

  // Wait for transaction to confirm
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Also update oracle TWAP to prevent TWAP-related issues
  try {
    const tx2 = await adminClient.updatePerpMarketAmmOracleTwap(0);
    console.log('Updated AMM oracle TWAP:', tx2);
  } catch (e) {
    console.log('Failed to update oracle TWAP (non-critical):', e.message);
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Connect as maker and close position
  console.log('\nStep 2: Connecting as maker to close position...');
  const makerClient = await createClient(MAKER_KEYPAIR_PATH, connection);

  const user = makerClient.getUser();
  const perpPositions = user.getUserAccount().perpPositions;
  const market0Position = perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());

  if (!market0Position) {
    console.log('No open position on market 0!');
  } else {
    const baseAmount = market0Position.baseAssetAmount;
    const isLong = baseAmount.gt(new BN(0));
    const absBase = isLong ? baseAmount : baseAmount.neg();
    const solAmount = absBase.toNumber() / BASE_PRECISION.toNumber();
    console.log(`Position: ${isLong ? 'LONG' : 'SHORT'} ${solAmount.toFixed(4)} SOL`);

    // Cancel all open orders first
    console.log('Cancelling all open orders...');
    try {
      const tx = await makerClient.cancelOrders();
      console.log('Cancelled all orders:', tx);
    } catch (e) {
      console.log('Cancel orders error (trying individually):', e.message);
      const openOrders = user.getOpenOrders();
      for (const order of openOrders) {
        try {
          await makerClient.cancelOrder(order.orderId);
        } catch (e2) { /* ignore */ }
      }
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Close position with market order
    const closeDirection = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
    const chunkSize = BASE_PRECISION.mul(new BN(10)); // 10 SOL per chunk
    let remaining = absBase;
    let chunkNum = 0;
    let failures = 0;

    while (remaining.gt(new BN(0)) && failures < 5) {
      const thisChunk = remaining.gt(chunkSize) ? chunkSize : remaining;
      chunkNum++;
      const chunkSol = thisChunk.toNumber() / BASE_PRECISION.toNumber();
      const remainingSol = remaining.toNumber() / BASE_PRECISION.toNumber();

      console.log(`\nChunk ${chunkNum}: closing ${chunkSol} SOL (${remainingSol} remaining)`);

      try {
        const tx = await makerClient.placePerpOrder({
          marketIndex: 0,
          orderType: OrderType.MARKET,
          direction: closeDirection,
          baseAssetAmount: thisChunk,
          reduceOnly: true,
        });
        console.log(`Close order placed: ${tx}`);
        remaining = remaining.sub(thisChunk);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        failures++;
        console.log(`Error (attempt ${failures}): ${e.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Check remaining position
    await new Promise(resolve => setTimeout(resolve, 3000));
    // Re-fetch account
    const finalUserAcct = user.getUserAccount();
    const finalPos = finalUserAcct.perpPositions.find(p => p.marketIndex === 0);
    if (finalPos && !finalPos.baseAssetAmount.isZero()) {
      const finalSol = finalPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
      console.log(`\nRemaining position: ${finalSol.toFixed(4)} SOL`);
      console.log('Note: Market orders need filler to execute. Check in a moment.');
    } else {
      console.log('\nPosition fully closed!');
    }
  }

  await makerClient.unsubscribe();

  // Step 3: Restore original price bands
  console.log('\nStep 3: Restoring original price bands...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  try {
    const tx3 = await adminClient.updateOracleGuardRails({
      priceDivergence: currentGuardRails.priceDivergence,
      validity: currentGuardRails.validity,
    });
    console.log('Restored price bands:', tx3);
  } catch (e) {
    console.log('Failed to restore price bands:', e.message);
    console.log('IMPORTANT: Price bands are still widened! Run this manually later.');
  }

  await adminClient.unsubscribe();
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
