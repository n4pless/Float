// fix-amm-position-v2.mjs
// Uses admin to widen fill price bands (margin ratio), close maker position, then restore
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

async function createAdminClient(keypairPath, connection) {
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  const wallet = new Wallet(keypair);

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
  return { client, wallet };
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== AMM Position Fix v2 ===\n');
  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  // Step 1: Connect as admin
  console.log('Connecting as admin...');
  const { client: adminClient, wallet: adminWallet } = await createAdminClient(ADMIN_KEYPAIR_PATH, connection);
  console.log('Admin:', adminWallet.publicKey.toBase58());

  // Check current market margin ratio
  const perpMarket = adminClient.getPerpMarketAccount(0);
  const currentMarginInitial = perpMarket.marginRatioInitial;
  const currentMarginMaintenance = perpMarket.marginRatioMaintenance;
  console.log('Current margin ratios:');
  console.log('  Initial:', currentMarginInitial, '(price band =', currentMarginInitial / 100, '%)');
  console.log('  Maintenance:', currentMarginMaintenance);

  // Step 2: Widen fill price bands by setting margin ratio initial very high
  // margin_ratio_initial = 9500 means fill can be up to 95% away from oracle
  const tempMarginInitial = 9500;
  const tempMarginMaintenance = currentMarginMaintenance; // keep maintenance the same
  
  console.log('\nWidening fill price bands (margin_ratio_initial -> 9500 = 95%)...');
  try {
    const tx = await adminClient.updatePerpMarketMarginRatio(0, tempMarginInitial, tempMarginMaintenance);
    console.log('Updated margin ratio:', tx);
  } catch (e) {
    console.error('Failed to widen margin ratio:', e.message);
    await adminClient.unsubscribe();
    process.exit(1);
  }

  // Also widen oracle guard rails for TWAP check
  const state = adminClient.getStateAccount();
  const currentGuardRails = state.oracleGuardRails;
  console.log('Current oracleTwap5MinPercentDivergence:', currentGuardRails.priceDivergence.oracleTwap5MinPercentDivergence.toString());
  
  try {
    const tx = await adminClient.updateOracleGuardRails({
      priceDivergence: {
        markOraclePercentDivergence: new BN(990000), // 99%
        oracleTwap5MinPercentDivergence: new BN(990000), // 99%
      },
      validity: currentGuardRails.validity,
    });
    console.log('Widened oracle guard rails:', tx);
  } catch (e) {
    console.log('Failed to widen oracle guard rails:', e.message);
  }

  // Also update oracle TWAP
  try {
    const tx = await adminClient.updatePerpMarketAmmOracleTwap(0);
    console.log('Updated AMM oracle TWAP:', tx);
  } catch (e) {
    console.log('Failed to update TWAP:', e.message);
  }

  await sleep(5000);

  // Step 3: Connect as maker, cancel all orders, place close orders
  console.log('\nConnecting as maker...');
  const { client: makerClient, wallet: makerWallet } = await createAdminClient(MAKER_KEYPAIR_PATH, connection);
  console.log('Maker:', makerWallet.publicKey.toBase58());

  const user = makerClient.getUser();
  const perpPositions = user.getUserAccount().perpPositions;
  const market0Position = perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());

  if (!market0Position) {
    console.log('No open position on market 0!');
    await makerClient.unsubscribe();
  } else {
    const baseAmount = market0Position.baseAssetAmount;
    const isLong = baseAmount.gt(new BN(0));
    const absBase = isLong ? baseAmount : baseAmount.neg();
    const solAmount = absBase.toNumber() / BASE_PRECISION.toNumber();
    console.log('Position:', isLong ? 'LONG' : 'SHORT', solAmount.toFixed(4), 'SOL');

    // Cancel all open orders first
    console.log('Cancelling all orders...');
    try {
      const tx = await makerClient.cancelOrders();
      console.log('Cancelled:', tx);
    } catch (e) {
      console.log('Cancel error:', e.message);
    }
    await sleep(3000);

    // Place market close orders in chunks
    const closeDirection = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
    const chunkSize = BASE_PRECISION.mul(new BN(10));
    let remaining = absBase;
    let chunkNum = 0;

    while (remaining.gt(new BN(0))) {
      const thisChunk = remaining.gt(chunkSize) ? chunkSize : remaining;
      chunkNum++;
      const sol = thisChunk.toNumber() / BASE_PRECISION.toNumber();
      const rem = remaining.toNumber() / BASE_PRECISION.toNumber();

      console.log(`Chunk ${chunkNum}: close ${sol.toFixed(3)} SOL (${rem.toFixed(3)} left)`);

      try {
        const tx = await makerClient.placePerpOrder({
          marketIndex: 0,
          orderType: OrderType.MARKET,
          direction: closeDirection,
          baseAssetAmount: thisChunk,
          reduceOnly: true,
        });
        console.log('  Placed:', tx);
        remaining = remaining.sub(thisChunk);
        await sleep(1000);
      } catch (e) {
        console.log('  Error:', e.message);
        await sleep(3000);
      }
    }

    // Wait for filler to process
    console.log('\nWaiting 30s for filler to process market orders...');
    for (let i = 30; i > 0; i -= 5) {
      console.log(`  ${i}s remaining...`);
      await sleep(5000);
    }

    // Check if orders were filled or expired
    const updatedPositions = user.getUserAccount().perpPositions;
    const updatedPos = updatedPositions.find(p => p.marketIndex === 0);
    if (updatedPos && !updatedPos.baseAssetAmount.isZero()) {
      const remSol = updatedPos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
      console.log('Remaining position:', remSol.toFixed(4), 'SOL');
      console.log('Market orders may need more time for filler to execute.');
    } else {
      console.log('Position closed!');
    }

    await makerClient.unsubscribe();
  }

  // Step 4: Wait a bit more then restore price bands  
  console.log('\nWaiting 30 more seconds for all fills to complete...');
  await sleep(30000);

  // Step 5: Restore original margin ratio
  console.log('Restoring original margin ratio...');
  try {
    const tx = await adminClient.updatePerpMarketMarginRatio(0, currentMarginInitial, currentMarginMaintenance);
    console.log('Restored margin ratio:', tx);
  } catch (e) {
    console.log('Failed to restore margin ratio:', e.message);
  }

  // Restore oracle guard rails
  try {
    const tx = await adminClient.updateOracleGuardRails({
      priceDivergence: currentGuardRails.priceDivergence,
      validity: currentGuardRails.validity,
    });
    console.log('Restored oracle guard rails:', tx);
  } catch (e) {
    console.log('Failed to restore guard rails:', e.message);
  }

  await adminClient.unsubscribe();
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
