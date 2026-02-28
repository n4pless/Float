/**
 * Compare AMM ask price vs maker bot ask prices
 * to understand why AMM fills instead of makers
 */
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { DriftClient, Wallet, initialize, OracleSource, PRICE_PRECISION, BASE_PRECISION } = require('@drift-labs/sdk');
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

  const market = client.getPerpMarketAccount(0);
  const amm = market.amm;
  
  // Oracle price
  const oracleData = client.getOracleDataForPerpMarket(0);
  const oraclePrice = oracleData.price.toNumber();
  console.log(`Oracle price: $${(oraclePrice / PRICE_PRECISION.toNumber()).toFixed(4)}`);

  // Reserve price (mid)
  const sqrtK = amm.sqrtK.toNumber();
  const baseReserve = amm.baseAssetReserve.toNumber();
  const quoteReserve = amm.quoteAssetReserve.toNumber();
  const pegMultiplier = amm.pegMultiplier.toNumber();
  
  console.log(`\n=== AMM Reserves ===`);
  console.log(`sqrtK: ${sqrtK}`);
  console.log(`baseAssetReserve: ${baseReserve}`);
  console.log(`quoteAssetReserve: ${quoteReserve}`);
  console.log(`pegMultiplier: ${pegMultiplier}`);
  console.log(`baseAssetAmountWithAmm: ${amm.baseAssetAmountWithAmm.toNumber() / BASE_PRECISION.toNumber()} SOL`);
  
  // Reserve price = (quoteReserve / baseReserve) * pegMultiplier / PEG_PRECISION
  // PEG_PRECISION = 1e3
  const reservePrice = (quoteReserve / baseReserve) * pegMultiplier / 1000;
  console.log(`\nReserve (mid) price: $${(reservePrice / PRICE_PRECISION.toNumber()).toFixed(4)}`);
  
  // Compute ask price = price after a small buy
  // For a buy (long), the AMM's ask price increases with the trade size
  // ask = (quoteReserve^2 / baseReserve_after) * peg where base decreases by trade amount
  // Actually, a simpler check: the AMM ask is reservePrice + half spread
  // In Drift, ask = reservePrice * (1 + baseSpread/2 + longSpread)
  
  let baseSpread = amm.baseSpread;
  let longSpread = amm.longSpread ? amm.longSpread.toNumber ? amm.longSpread.toNumber() : Number(amm.longSpread) : 0;
  let shortSpread = amm.shortSpread ? amm.shortSpread.toNumber ? amm.shortSpread.toNumber() : Number(amm.shortSpread) : 0;
  let maxSpread = amm.maxSpread;

  console.log(`\n=== AMM Spread Config ===`);
  console.log(`baseSpread: ${baseSpread} (${baseSpread / 10000}%)`);
  console.log(`longSpread: ${longSpread}`);
  console.log(`shortSpread: ${shortSpread}`);
  console.log(`maxSpread: ${maxSpread} (${maxSpread / 10000}%)`);
  
  // The ask price with spread
  // askSpreadBps = (baseSpread/2 + longSpread) clamped by maxSpread
  const askSpreadFromReserve = longSpread;
  const bidSpreadFromReserve = shortSpread;
  
  // AMM bid = reservePrice * (1 - bidSpread/BID_ASK_SPREAD_PRECISION)
  // AMM ask = reservePrice * (1 + askSpread/BID_ASK_SPREAD_PRECISION)
  // BID_ASK_SPREAD_PRECISION = 1_000_000
  const BID_ASK_SPREAD_PRECISION = 1000000;
  const ammAsk = reservePrice * (1 + askSpreadFromReserve / BID_ASK_SPREAD_PRECISION);
  const ammBid = reservePrice * (1 - bidSpreadFromReserve / BID_ASK_SPREAD_PRECISION);
  
  console.log(`\n=== AMM Prices ===`);
  console.log(`AMM bid: $${(ammBid / PRICE_PRECISION.toNumber()).toFixed(4)}`);
  console.log(`AMM ask: $${(ammAsk / PRICE_PRECISION.toNumber()).toFixed(4)}`);
  console.log(`AMM spread: ${((ammAsk - ammBid) / reservePrice * 100).toFixed(4)}%`);

  // Get maker's SHORT orders (asks) and compare
  const allUsers = await client.fetchAllUserAccounts(true);
  const maker = allUsers.find(u => u.account.authority.toBase58() === MAKER_AUTHORITY);
  
  if (maker) {
    const shortOrders = maker.account.orders.filter(o => {
      if (!o || !('open' in o.status)) return false;
      if (o.baseAssetAmount.isZero()) return false;
      return !('long' in o.direction);
    });
    
    console.log(`\n=== Maker Bot ASK Prices (SHORT orders) ===`);
    const makerAsks = shortOrders.map(o => {
      const offset = o.oraclePriceOffset || 0;
      const effectivePrice = oraclePrice + offset;
      return { orderId: o.orderId, effectivePrice, offset };
    }).sort((a, b) => a.effectivePrice - b.effectivePrice);
    
    for (const a of makerAsks) {
      const cheaper = a.effectivePrice < ammAsk;
      console.log(`  Ask: $${(a.effectivePrice / PRICE_PRECISION.toNumber()).toFixed(4)} (offset: +$${(a.offset / PRICE_PRECISION.toNumber()).toFixed(4)}) ${cheaper ? '< AMM *** SHOULD FILL FIRST ***' : '> AMM (AMM fills first)'}`);
    }
    
    console.log(`\n=== VERDICT ===`);
    const cheapestMakerAsk = makerAsks[0]?.effectivePrice || 0;
    if (cheapestMakerAsk < ammAsk) {
      console.log(`Maker's cheapest ask ($${(cheapestMakerAsk/PRICE_PRECISION.toNumber()).toFixed(4)}) < AMM ask ($${(ammAsk/PRICE_PRECISION.toNumber()).toFixed(4)})`);
      console.log(`Maker SHOULD get fills. There may be another issue.`);
    } else {
      console.log(`AMM ask ($${(ammAsk/PRICE_PRECISION.toNumber()).toFixed(4)}) <= Maker's cheapest ask ($${(cheapestMakerAsk/PRICE_PRECISION.toNumber()).toFixed(4)})`);
      console.log(`AMM ALWAYS fills first because it offers a better price.`);
      console.log(`The maker bot's position will NEVER change until its spread is tighter.`);
      console.log(`\nTo fix: reduce the maker bot's oracle offset in the config.`);
      console.log(`Current smallest offset: +$${(makerAsks[0]?.offset/PRICE_PRECISION.toNumber()).toFixed(4)}`);
      console.log(`AMM spread: $${((ammAsk - ammBid) / PRICE_PRECISION.toNumber()).toFixed(4)}`);
      console.log(`Maker needs offset < ${((ammAsk - oraclePrice) / PRICE_PRECISION.toNumber()).toFixed(4)} to beat AMM`);
    }
  }

  await client.unsubscribe();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
