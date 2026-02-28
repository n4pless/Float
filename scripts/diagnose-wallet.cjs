/**
 * Diagnose who is filling trades for a specific wallet.
 * Check wallet position, maker position, AMM state, and recent txs.
 */
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const fs = require('fs');
const path = require('path');

const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const WALLET = new PublicKey('Fm4q9C7kzzEZkFk3ihzA1VVQJRE1LK8kMiZ99Y94mcd');
const MAKER = new PublicKey('4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U');

const BOT_WALLETS = {
  'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G': 'Admin',
  '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U': 'Maker',
  '66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK': 'Filler',
  'D9k5Mo7YLBoQi7prKyVrfc9xKFRmJYzh2vifnuzuYNGX': 'Liquidator',
};

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const idl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'protocol-v2', 'target', 'idl', 'drift.json'), 'utf8'));
  const dummyWallet = { publicKey: WALLET, signTransaction: async t=>t, signAllTransactions: async t=>t };
  const provider = new anchor.AnchorProvider(conn, dummyWallet, {});
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // Fetch all user accounts
  const users = await program.account.user.all();
  console.log('Total Drift user accounts:', users.length);

  // List all users and their positions
  console.log('\n=== ALL USER ACCOUNTS ===');
  for (const u of users) {
    const auth = u.account.authority.toBase58();
    const label = BOT_WALLETS[auth] || 'Unknown';
    const pos = u.account.perpPositions[0];
    const base = pos.baseAssetAmount.toNumber() / 1e9;
    const orders = u.account.openOrders;
    console.log(`  ${auth.slice(0, 8)}... (${label}) | Position: ${base.toFixed(4)} SOL | OpenOrders: ${orders}`);
  }

  // Check if the target wallet exists
  const walletUser = users.find(u => u.account.authority.toBase58() === WALLET.toBase58());
  if (walletUser) {
    const pos = walletUser.account.perpPositions[0];
    const base = pos.baseAssetAmount.toNumber() / 1e9;
    console.log(`\n=== TARGET WALLET: ${WALLET.toBase58()} ===`);
    console.log(`  Position: ${base.toFixed(4)} SOL`);
    console.log(`  Open orders: ${walletUser.account.openOrders}`);
    console.log(`  User PDA: ${walletUser.publicKey.toBase58()}`);
    
    // List orders
    const orders = walletUser.account.orders.filter(o => o.status && o.status.open);
    if (orders.length > 0) {
      console.log(`  Active orders:`);
      for (const o of orders) {
        const dir = o.direction.long ? 'LONG' : 'SHORT';
        const size = o.baseAssetAmount.toNumber() / 1e9;
        const offset = o.oraclePriceOffset ? o.oraclePriceOffset.toNumber ? o.oraclePriceOffset.toNumber() : o.oraclePriceOffset : 0;
        const type = Object.keys(o.orderType)[0];
        console.log(`    #${o.orderId} ${type} ${dir} ${size.toFixed(4)} SOL offset=${offset}`);
      }
    }
  } else {
    console.log(`\n>>> WALLET ${WALLET.toBase58()} NOT FOUND as a Drift user! <<<`);
    console.log('This wallet has never initialized a Drift account on this program.');
  }

  // AMM state
  const [perpMarketPda] = await PublicKey.findProgramAddress(
    [Buffer.from('perp_market'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)],
    PROGRAM_ID
  );
  const market = await program.account.perpMarket.fetch(perpMarketPda);
  const amm = market.amm;
  const baseWithAmm = amm.baseAssetAmountWithAmm.toNumber() / 1e9;
  console.log('\n=== AMM STATE ===');
  console.log(`  baseAssetAmountWithAmm: ${baseWithAmm.toFixed(4)} SOL`);
  console.log(`  baseSpread: ${amm.baseSpread} (${(amm.baseSpread/10000).toFixed(2)}%)`);
  console.log(`  longSpread: ${amm.longSpread}`);
  console.log(`  shortSpread: ${amm.shortSpread}`);

  // Check recent transactions for this wallet to see what happened
  console.log('\n=== RECENT TRANSACTIONS ===');
  try {
    const sigs = await conn.getSignaturesForAddress(WALLET, { limit: 5 });
    for (const sig of sigs) {
      console.log(`  ${sig.signature.slice(0, 20)}... | ${new Date(sig.blockTime * 1000).toISOString()} | ${sig.err ? 'FAILED' : 'OK'}`);
    }
    
    if (sigs.length > 0) {
      // Inspect the latest tx
      const latestTx = await conn.getTransaction(sigs[0].signature, { maxSupportedTransactionVersion: 0 });
      if (latestTx && latestTx.meta && latestTx.meta.logMessages) {
        console.log('\n  Latest TX logs (filtered):');
        const logs = latestTx.meta.logMessages.filter(l => 
          l.includes('fill') || l.includes('order') || l.includes('place') || 
          l.includes('taker') || l.includes('maker') || l.includes('amm') ||
          l.includes('Program log:')
        );
        logs.forEach(l => console.log('    ', l));
      }
    }
  } catch(e) {
    console.log('  Could not fetch transactions:', e.message);
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
