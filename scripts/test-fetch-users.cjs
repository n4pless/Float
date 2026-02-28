/**
 * Test: verify fetchAllUserAccounts works with websocket DriftClient
 * and check oracle price + maker order matching logic
 */
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { DriftClient, Wallet, initialize, OracleSource, BASE_PRECISION, PRICE_PRECISION, PositionDirection, getUserStatsAccountPublicKey } = require('@drift-labs/sdk');
const BN = require('bn.js');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const ORACLE = new PublicKey('8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG');

const MAKER_AUTHORITY = '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U';
const ADMIN_AUTHORITY = 'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G';

async function main() {
  initialize({ env: 'devnet' });
  const conn = new Connection(RPC, 'confirmed');
  const raw = JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'));
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new Wallet(kp);

  console.log('=== TEST 1: DriftClient with websocket subscription ===');
  const client = new DriftClient({
    connection: conn,
    wallet,
    programID: PROGRAM_ID,
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: ORACLE, source: OracleSource.Prelaunch }],
  });
  await client.subscribe();
  console.log('Client subscribed OK');

  // Test fetchAllUserAccounts
  console.log('\n=== TEST 2: fetchAllUserAccounts(true) ===');
  let allUsers;
  try {
    allUsers = await client.fetchAllUserAccounts(true);
    console.log(`SUCCESS: ${allUsers.length} accounts returned`);
    for (const u of allUsers) {
      const auth = u.account.authority.toBase58();
      const isMaker = auth === MAKER_AUTHORITY;
      const isAdmin = auth === ADMIN_AUTHORITY;
      const label = isMaker ? 'MAKER' : isAdmin ? 'ADMIN' : 'user';
      console.log(`  [${label}] auth=${auth.slice(0,12)}... key=${u.publicKey.toBase58().slice(0,12)}...`);
    }
  } catch (e) {
    console.error(`FAILED: ${e.message}`);
    await client.unsubscribe();
    process.exit(1);
  }

  // Test oracle price
  console.log('\n=== TEST 3: Oracle price ===');
  let oraclePrice;
  try {
    const oracle = client.getOracleDataForPerpMarket(0);
    oraclePrice = oracle.price;
    console.log(`Oracle price (raw BN): ${oracle.price.toString()}`);
    console.log(`Oracle price (USD): $${(oracle.price.toNumber() / PRICE_PRECISION.toNumber()).toFixed(4)}`);
  } catch (e) {
    console.error(`Oracle FAILED: ${e.message}`);
  }

  // Test _getMakerInfoForOrder logic (inline simulation)
  console.log('\n=== TEST 4: Simulating _getMakerInfoForOrder for LONG (buy) ===');
  const myKey = wallet.publicKey.toString(); // admin wallet
  let makerCount = 0;
  
  for (const { publicKey, account: userAccount } of allUsers) {
    if (!userAccount || !userAccount.orders) continue;
    if (userAccount.authority.toString() === myKey) {
      console.log(`  Skipping self (admin): ${userAccount.authority.toBase58().slice(0,8)}...`);
      continue;
    }

    const hasOpposingOrder = userAccount.orders.some((order) => {
      if (!order || !('open' in (order.status))) return false;
      if (order.baseAssetAmount.isZero()) return false;
      if (order.marketIndex !== 0) return false;
      if (!('perp' in (order.marketType))) return false;
      if (!('limit' in (order.orderType))) return false;
      const remaining = order.baseAssetAmount.toNumber() - order.baseAssetAmountFilled.toNumber();
      if (remaining <= 0) return false;
      // For LONG taker, we need SHORT makers (sells)
      const orderIsLong = 'long' in (order.direction);
      return !orderIsLong; // want SHORT orders
    });

    if (hasOpposingOrder) {
      makerCount++;
      const auth = userAccount.authority.toBase58();
      console.log(`  FOUND MAKER: auth=${auth.slice(0,12)}... key=${publicKey.toBase58().slice(0,12)}... isMakerBot=${auth === MAKER_AUTHORITY}`);
      
      // Show their SHORT orders
      const shortOrders = userAccount.orders.filter(o => {
        if (!o || !('open' in o.status)) return false;
        if (o.baseAssetAmount.isZero()) return false;
        if (o.marketIndex !== 0) return false;
        return !('long' in o.direction);
      });
      for (const o of shortOrders) {
        const price = o.price.toNumber();
        const offset = o.oraclePriceOffset || 0;
        const effectivePrice = price > 0 ? price : (oraclePrice ? oraclePrice.toNumber() + offset : 0);
        console.log(`    SHORT order #${o.orderId}: price=${price} offset=${offset} effective=${effectivePrice} (=$${(effectivePrice / PRICE_PRECISION.toNumber()).toFixed(4)})`);
      }
    }
  }
  console.log(`Total makers found: ${makerCount}`);

  // Test auction price computation
  if (oraclePrice) {
    console.log('\n=== TEST 5: Auction price computation ===');
    const oracleNum = oraclePrice.toNumber();
    const slippageBps = 500; // 5%
    const worstCasePrice = new BN(Math.ceil(oracleNum * (1 + slippageBps / 10000)));
    console.log(`Oracle (raw): ${oracleNum}`);
    console.log(`WorstCase (raw): ${worstCasePrice.toString()}`);
    console.log(`Oracle (USD): $${(oracleNum / PRICE_PRECISION.toNumber()).toFixed(4)}`);
    console.log(`WorstCase (USD): $${(worstCasePrice.toNumber() / PRICE_PRECISION.toNumber()).toFixed(4)}`);
    console.log(`auctionStartPrice = auctionEndPrice = worstCasePrice = ${worstCasePrice.toString()}`);
  }

  // Check if there's a user account with 1 open order (that user with 1 order)
  console.log('\n=== TEST 6: Check for user resting orders ===');
  for (const { publicKey, account } of allUsers) {
    const openOrders = (account.orders || []).filter(o => {
      if (!o || !('open' in o.status)) return false;
      return !o.baseAssetAmount.isZero();
    });
    if (openOrders.length > 0 && account.authority.toBase58() !== MAKER_AUTHORITY) {
      const auth = account.authority.toBase58();
      console.log(`  User ${auth.slice(0,12)}... has ${openOrders.length} open order(s):`);
      for (const o of openOrders) {
        const dir = 'long' in o.direction ? 'LONG' : 'SHORT';
        const price = o.price.toNumber();
        const base = o.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
        const filled = o.baseAssetAmountFilled.toNumber() / BASE_PRECISION.toNumber();
        console.log(`    #${o.orderId}: ${dir} ${base} SOL (filled: ${filled}) @ price=${price} ($${(price / PRICE_PRECISION.toNumber()).toFixed(2)})`);
      }
    }
  }

  await client.unsubscribe();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
