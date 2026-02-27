// close-position-direct.mjs
// Uses placeAndTakePerpOrder to close position directly against AMM (no filler needed)
// Admin first widens price bands, then maker closes, then admin restores
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  AdminClient,
  DriftClient,
  Wallet,
  PositionDirection,
  OrderType,
  BASE_PRECISION,
  BN,
  initialize,
  getMarketsAndOraclesForSubscription,
  MarketType,
} from '@drift-labs/sdk';
import fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const ADMIN_KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';
const MAKER_KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/maker-keypair.json';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function makeClient(keypairPath, connection, ClientClass) {
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf-8'))));
  const wallet = new Wallet(kp);
  const sdkConfig = initialize({ env: 'devnet' });
  sdkConfig.DRIFT_PROGRAM_ID = PROGRAM_ID;
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');
  const client = new ClientClass({
    connection, wallet,
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes, spotMarketIndexes, oracleInfos,
  });
  await client.subscribe();
  return { client, wallet };
}

async function main() {
  console.log('=== Direct Position Close ===\n');
  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  // Step 1: Admin widens price bands
  console.log('1. Admin widening price bands...');
  const { client: admin } = await makeClient(ADMIN_KEYPAIR_PATH, connection, AdminClient);

  const market = admin.getPerpMarketAccount(0);
  const origMarginInit = market.marginRatioInitial;
  const origMarginMaint = market.marginRatioMaintenance;
  const state = admin.getStateAccount();
  const origGuardRails = state.oracleGuardRails;
  console.log(`   margin_ratio_initial: ${origMarginInit} (price band = ${origMarginInit/100}%)`);

  // Widen to 95%
  let tx = await admin.updatePerpMarketMarginRatio(0, 9500, origMarginMaint);
  console.log('   Widened margin ratio:', tx);

  tx = await admin.updateOracleGuardRails({
    priceDivergence: {
      markOraclePercentDivergence: new BN(990000),
      oracleTwap5MinPercentDivergence: new BN(990000),
    },
    validity: origGuardRails.validity,
  });
  console.log('   Widened guard rails:', tx);

  tx = await admin.updatePerpMarketAmmOracleTwap(0);
  console.log('   Updated TWAP:', tx);
  await sleep(3000);

  // Step 2: Maker closes position using placeAndTakePerpOrder
  console.log('\n2. Maker closing position with placeAndTake...');
  const { client: maker, wallet: makerWallet } = await makeClient(MAKER_KEYPAIR_PATH, connection, DriftClient);
  console.log('   Maker:', makerWallet.publicKey.toBase58());

  // Cancel any open orders first
  try { await maker.cancelOrders(); } catch(e) {}
  await sleep(2000);

  const user = maker.getUser();
  let pos = user.getUserAccount().perpPositions.find(p => p.marketIndex === 0 && !p.baseAssetAmount.isZero());
  
  if (!pos) {
    console.log('   No position to close!');
  } else {
    const isLong = pos.baseAssetAmount.gt(new BN(0));
    const absBase = isLong ? pos.baseAssetAmount : pos.baseAssetAmount.neg();
    console.log(`   Position: ${isLong ? 'LONG' : 'SHORT'} ${(absBase.toNumber() / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);

    const closeDir = isLong ? PositionDirection.SHORT : PositionDirection.LONG;
    const chunkSize = BASE_PRECISION.mul(new BN(5)); // 5 SOL per chunk
    let remaining = absBase;
    let num = 0;

    while (remaining.gt(new BN(0))) {
      const chunk = remaining.gt(chunkSize) ? chunkSize : remaining;
      num++;
      const sol = chunk.toNumber() / BASE_PRECISION.toNumber();
      const rem = remaining.toNumber() / BASE_PRECISION.toNumber();
      process.stdout.write(`   Chunk ${num}: ${sol} SOL (${rem.toFixed(1)} left)... `);

      try {
        const closeTx = await maker.placeAndTakePerpOrder({
          marketIndex: 0,
          marketType: MarketType.PERP,
          orderType: OrderType.MARKET,
          direction: closeDir,
          baseAssetAmount: chunk,
          reduceOnly: true,
        });
        console.log('OK:', closeTx.substring(0, 20) + '...');
        remaining = remaining.sub(chunk);
        await sleep(1500);
      } catch (e) {
        console.log('FAIL:', e.message.substring(0, 100));
        await sleep(3000);
        // Try smaller chunk
        if (chunk.gt(BASE_PRECISION)) {
          console.log('   Retrying with 1 SOL...');
          try {
            const tx2 = await maker.placeAndTakePerpOrder({
              marketIndex: 0,
              marketType: MarketType.PERP,
              orderType: OrderType.MARKET,
              direction: closeDir,
              baseAssetAmount: BASE_PRECISION,
              reduceOnly: true,
            });
            console.log('   Small chunk OK:', tx2.substring(0, 20) + '...');
            remaining = remaining.sub(BASE_PRECISION);
          } catch (e2) {
            console.log('   Small chunk also failed:', e2.message.substring(0, 100));
            console.log('   Stopping - may need different approach');
            break;
          }
        } else {
          break;
        }
      }
    }

    // Check final position
    await sleep(2000);
    pos = user.getUserAccount().perpPositions.find(p => p.marketIndex === 0);
    if (pos && !pos.baseAssetAmount.isZero()) {
      const finalSol = pos.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
      console.log(`\n   Remaining: ${finalSol.toFixed(4)} SOL`);
    } else {
      console.log('\n   Position CLOSED!');
    }
  }

  await maker.unsubscribe();

  // Step 3: Admin restores price bands
  console.log('\n3. Admin restoring price bands...');
  await sleep(2000);
  
  tx = await admin.updatePerpMarketMarginRatio(0, origMarginInit, origMarginMaint);
  console.log('   Restored margin ratio:', tx);

  tx = await admin.updateOracleGuardRails({
    priceDivergence: origGuardRails.priceDivergence,
    validity: origGuardRails.validity,
  });
  console.log('   Restored guard rails:', tx);

  await admin.unsubscribe();
  console.log('\n=== Done ===');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
