/**
 * End-to-end test: place a small market buy and check if the maker
 * bot's position changes (fill against maker) or stays the same (AMM fill).
 */
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const {
  DriftClient, Wallet, initialize, OracleSource,
  BASE_PRECISION, PRICE_PRECISION,
  PositionDirection, OrderType, MarketType,
  getUserStatsAccountPublicKey,
} = require('@drift-labs/sdk');
const BN = require('bn.js');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const ORACLE = new PublicKey('8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG');
const MAKER_AUTHORITY = '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U';

async function main() {
  initialize({ env: 'devnet' });
  const conn = new Connection(RPC, 'confirmed');
  const raw = JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'));
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new Wallet(kp);
  console.log('Admin wallet:', kp.publicKey.toBase58());

  const client = new DriftClient({
    connection: conn,
    wallet,
    programID: PROGRAM_ID,
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: ORACLE, source: OracleSource.Prelaunch }],
    txVersion: 'legacy',
    activeSubAccountId: 0,
  });
  await client.subscribe();
  console.log('Client subscribed');

  // Get all user accounts
  const allUsers = await client.fetchAllUserAccounts(true);
  console.log('Fetched', allUsers.length, 'user accounts');

  // Record maker position BEFORE
  const makerBefore = allUsers.find(u => u.account.authority.toBase58() === MAKER_AUTHORITY);
  const makerBaseBefore = makerBefore
    ? makerBefore.account.perpPositions[0]?.baseAssetAmount?.toNumber() || 0
    : 0;
  console.log(`\nMaker position BEFORE: ${(makerBaseBefore / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);

  // Record admin (taker) position BEFORE
  const adminAuth = kp.publicKey.toBase58();
  const adminBefore = allUsers.find(u => u.account.authority.toBase58() === adminAuth);
  const adminBaseBefore = adminBefore
    ? adminBefore.account.perpPositions[0]?.baseAssetAmount?.toNumber() || 0
    : 0;
  console.log(`Admin position BEFORE: ${(adminBaseBefore / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);

  // Build maker info for the maker bot (same logic as frontend)
  const makerInfoList = [];
  for (const { publicKey, account: userAccount } of allUsers) {
    if (userAccount.authority.toBase58() === adminAuth) continue; // skip self

    const hasShortOrder = userAccount.orders.some((order) => {
      if (!order || !('open' in order.status)) return false;
      if (order.baseAssetAmount.isZero()) return false;
      if (order.marketIndex !== 0) return false;
      if (!('perp' in order.marketType)) return false;
      if (!('limit' in order.orderType)) return false;
      const remaining = order.baseAssetAmount.toNumber() - order.baseAssetAmountFilled.toNumber();
      if (remaining <= 0) return false;
      return !('long' in order.direction); // SHORT = sell
    });

    if (!hasShortOrder) continue;

    try {
      const makerStats = getUserStatsAccountPublicKey(PROGRAM_ID, userAccount.authority);
      makerInfoList.push({
        maker: publicKey,
        makerStats,
        makerUserAccount: userAccount,
      });
      console.log(`  Found maker: ${userAccount.authority.toBase58().slice(0,12)}... (isMakerBot=${userAccount.authority.toBase58() === MAKER_AUTHORITY})`);
    } catch (e) {
      console.log(`  Failed to get makerStats for ${publicKey.toBase58().slice(0,8)}: ${e.message}`);
    }
  }
  console.log(`Total makers: ${makerInfoList.length}`);

  // Oracle and auction prices
  const oracle = client.getOracleDataForPerpMarket(0);
  const oracleNum = oracle.price.toNumber();
  const slippageBps = 500;
  const worstCasePrice = new BN(Math.ceil(oracleNum * (1 + slippageBps / 10000)));
  console.log(`\nOracle: $${(oracleNum / PRICE_PRECISION.toNumber()).toFixed(4)}`);
  console.log(`WorstCase: $${(worstCasePrice.toNumber() / PRICE_PRECISION.toNumber()).toFixed(4)}`);

  // Place a small market buy: 0.5 SOL
  const baseAmount = new BN(Math.floor(0.5 * BASE_PRECISION.toNumber()));
  console.log(`\nPlacing market BUY 0.5 SOL with ${makerInfoList.length} maker(s)...`);

  try {
    const txSig = await client.placeAndTakePerpOrder(
      {
        marketIndex: 0,
        direction: PositionDirection.LONG,
        baseAssetAmount: baseAmount,
        orderType: OrderType.MARKET,
        price: worstCasePrice,
        auctionDuration: 10,
        auctionStartPrice: worstCasePrice,
        auctionEndPrice: worstCasePrice,
      },
      makerInfoList.length > 0 ? makerInfoList : undefined,
    );
    const sig = typeof txSig === 'string' ? txSig : String(txSig);
    console.log('SUCCESS! TX:', sig);
    console.log(`View: https://solscan.io/tx/${sig}?cluster=devnet`);
  } catch (e) {
    console.error('FAILED:', e.message);
    if (e.logs) {
      console.error('TX logs:');
      for (const l of e.logs) console.error('  ', l);
    }
    await client.unsubscribe();
    process.exit(1);
  }

  // Wait for confirmation and re-fetch
  console.log('\nWaiting 3s for confirmation...');
  await new Promise(r => setTimeout(r, 3000));

  const allUsersAfter = await client.fetchAllUserAccounts(true);

  // Record maker position AFTER
  const makerAfter = allUsersAfter.find(u => u.account.authority.toBase58() === MAKER_AUTHORITY);
  const makerBaseAfter = makerAfter
    ? makerAfter.account.perpPositions[0]?.baseAssetAmount?.toNumber() || 0
    : 0;
  console.log(`\nMaker position AFTER: ${(makerBaseAfter / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);

  // Record admin position AFTER
  const adminAfter = allUsersAfter.find(u => u.account.authority.toBase58() === adminAuth);
  const adminBaseAfter = adminAfter
    ? adminAfter.account.perpPositions[0]?.baseAssetAmount?.toNumber() || 0
    : 0;
  console.log(`Admin position AFTER: ${(adminBaseAfter / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);

  // Analysis
  const makerDelta = (makerBaseAfter - makerBaseBefore) / BASE_PRECISION.toNumber();
  const adminDelta = (adminBaseAfter - adminBaseBefore) / BASE_PRECISION.toNumber();
  console.log(`\n=== RESULT ===`);
  console.log(`Admin delta: ${adminDelta > 0 ? '+' : ''}${adminDelta.toFixed(4)} SOL`);
  console.log(`Maker delta: ${makerDelta > 0 ? '+' : ''}${makerDelta.toFixed(4)} SOL`);
  if (Math.abs(makerDelta) > 0.01) {
    console.log('>>> FILL AGAINST MAKER <<<');
  } else {
    console.log('>>> FILL AGAINST AMM (maker position unchanged) <<<');
  }

  await client.unsubscribe();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
