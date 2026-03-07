/**
 * Debug script: inspect all on-chain Drift user positions
 * Specifically look at the Maker bot's position to understand
 * why the Bot Monitor size isn't updating.
 */
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { DriftClient, Wallet, initialize, BASE_PRECISION, PRICE_PRECISION, OracleSource, decodeName } = require('@drift-labs/sdk');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');

const MAKER_AUTHORITY = '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U';
const ADMIN_AUTHORITY = 'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G';
const FILLER_AUTHORITY = '66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK';
const LIQ_AUTHORITY = 'D9k5Mo7YLBoQi7prKyVrfc9xKFRmJYzh2vifnuzuYNGX';

const KNOWN = {
  [ADMIN_AUTHORITY]: 'Admin',
  [FILLER_AUTHORITY]: 'Filler',
  [LIQ_AUTHORITY]: 'Liquidator',
  [MAKER_AUTHORITY]: 'Maker',
};

const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const RPC = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';

async function main() {
  initialize({ env: 'devnet' });
  const conn = new Connection(RPC, 'confirmed');
  const raw = JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'));
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  const wallet = new Wallet(kp);

  // Use websocket subscription to avoid batch request issues with Helius free tier
  const client = new DriftClient({
    connection: conn,
    wallet,
    programID: PROGRAM_ID,
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: new PublicKey('8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG'), source: OracleSource.Prelaunch }],
  });
  await client.subscribe();

  // Use getProgramAccounts directly to get all user accounts
  const idl = require('@drift-labs/sdk/src/idl/drift.json');
  const provider = new anchor.AnchorProvider(conn, wallet, {});
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  
  const allUsers = await program.account.user.all();
  console.log('Total user accounts on protocol:', allUsers.length);
  console.log('');

  // Show ALL positions
  console.log('=== ALL POSITIONS ===');
  for (const u of allUsers) {
    const auth = u.account.authority?.toBase58?.() || 'unknown';
    const label = KNOWN[auth] || 'User';
    const perpPos = u.account.perpPositions || [];
    
    for (const p of perpPos) {
      const base = p.baseAssetAmount;
      if (!base) continue;
      const baseN = typeof base.toNumber === 'function' ? base.toNumber() : Number(base);
      if (baseN === 0) continue;
      
      const baseSOL = baseN / BASE_PRECISION.toNumber();
      const quoteEntry = p.quoteEntryAmount;
      const quoteN = quoteEntry ? (typeof quoteEntry.toNumber === 'function' ? quoteEntry.toNumber() : Number(quoteEntry)) : 0;
      const quoteUSD = quoteN / PRICE_PRECISION.toNumber();
      const entry = baseSOL !== 0 ? Math.abs(quoteUSD / baseSOL) : 0;
      
      const orders = (u.account.orders || []).filter(o => {
        if (!o || !o.status) return false;
        return typeof o.status === 'object' ? 'open' in o.status : false;
      }).length;
      
      const dir = baseSOL > 0 ? 'LONG' : 'SHORT';
      console.log(`  ${label.padEnd(12)} | ${dir.padEnd(5)} | ${Math.abs(baseSOL).toFixed(4).padStart(10)} SOL | Entry: $${entry.toFixed(2).padStart(8)} | Orders: ${orders} | Auth: ${auth.slice(0,8)}... | Acct: ${u.publicKey.toBase58().slice(0,8)}...`);
    }
  }

  // Show ALL user accounts for maker authority (even without positions)
  console.log('');
  console.log('=== MAKER BOT ACCOUNTS (all sub-accounts) ===');
  const makerAccounts = allUsers.filter(u => u.account.authority?.toBase58?.() === MAKER_AUTHORITY);
  console.log(`Found ${makerAccounts.length} account(s) for maker authority ${MAKER_AUTHORITY.slice(0,8)}...`);
  for (const u of makerAccounts) {
    const perpPos = u.account.perpPositions || [];
    let baseTotal = 0;
    for (const p of perpPos) {
      const b = p.baseAssetAmount;
      if (b) baseTotal += (typeof b.toNumber === 'function' ? b.toNumber() : Number(b));
    }
    const orders = (u.account.orders || []).filter(o => {
      if (!o || !o.status) return false;
      return typeof o.status === 'object' ? 'open' in o.status : false;
    }).length;
    console.log(`  SubAccount ${u.account.subAccountId} | Key: ${u.publicKey.toBase58().slice(0,8)}... | Base: ${(baseTotal / BASE_PRECISION.toNumber()).toFixed(4)} SOL | Open Orders: ${orders}`);
    
    // Show individual order details
    const openOrders = (u.account.orders || []).filter(o => {
      if (!o || !o.status) return false;
      return typeof o.status === 'object' ? 'open' in o.status : false;
    });
    for (const o of openOrders) {
      const dir = o.direction && typeof o.direction === 'object' ? ('long' in o.direction ? 'LONG' : 'SHORT') : '?';
      const baseAmt = o.baseAssetAmount ? (typeof o.baseAssetAmount.toNumber === 'function' ? o.baseAssetAmount.toNumber() : Number(o.baseAssetAmount)) / BASE_PRECISION.toNumber() : 0;
      const price = o.price ? (typeof o.price.toNumber === 'function' ? o.price.toNumber() : Number(o.price)) / PRICE_PRECISION.toNumber() : 0;
      const oracleOffset = o.oraclePriceOffset ? (typeof o.oraclePriceOffset.toNumber === 'function' ? o.oraclePriceOffset.toNumber() : Number(o.oraclePriceOffset)) / PRICE_PRECISION.toNumber() : 0;
      const orderTypeStr = JSON.stringify(o.orderType);
      const marketTypeStr = JSON.stringify(o.marketType);
      console.log(`    Order #${o.orderId}: ${dir} ${baseAmt.toFixed(4)} SOL @ $${price.toFixed(2)} (offset: ${oracleOffset.toFixed(4)}) | orderType: ${orderTypeStr} | marketType: ${marketTypeStr}`);
    }
  }

  // Also check the AMM position (the protocol's own position)
  console.log('');
  console.log('=== AMM STATE ===');
  const perpMarket = client.getPerpMarketAccount(0);
  if (perpMarket) {
    const ammBase = perpMarket.amm.baseAssetAmountWithAmm;
    const ammBaseNum = (typeof ammBase.toNumber === 'function' ? ammBase.toNumber() : Number(ammBase)) / BASE_PRECISION.toNumber();
    console.log(`  AMM base (w/ amm): ${ammBaseNum.toFixed(4)} SOL`);
    const longOI = perpMarket.amm.baseAssetAmountLong;
    const shortOI = perpMarket.amm.baseAssetAmountShort;
    console.log(`  Long OI: ${((typeof longOI.toNumber === 'function' ? longOI.toNumber() : Number(longOI)) / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);
    console.log(`  Short OI: ${((typeof shortOI.toNumber === 'function' ? shortOI.toNumber() : Number(shortOI)) / BASE_PRECISION.toNumber()).toFixed(4)} SOL`);
  }

  await client.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
