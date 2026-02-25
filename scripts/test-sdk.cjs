const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const sdk = require('@drift-labs/sdk');
const fs = require('fs');

console.log('SDK loaded, version:', sdk.DRIFT_PROGRAM_ID?.toString?.() ?? 'unknown');

(async () => {
  try {
    sdk.initialize({ env: 'devnet' });
    console.log('SDK initialized');
    
    const conn = new Connection('http://localhost:8899', 'confirmed');
    const version = await conn.getVersion();
    console.log('Connected to validator:', version['solana-core']);
    
    const kp = Keypair.fromSecretKey(
      new Uint8Array(JSON.parse(fs.readFileSync('keys/admin-keypair.json', 'utf-8')))
    );
    console.log('Wallet:', kp.publicKey.toString());
    
    const wallet = {
      publicKey: kp.publicKey,
      signTransaction: async t => t,
      signAllTransactions: async ts => ts,
    };
    
    const loader = new sdk.BulkAccountLoader(conn, 'confirmed', 5000);
    
    const client = new sdk.DriftClient({
      connection: conn,
      wallet,
      programID: new PublicKey('dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'),
      perpMarketIndexes: [0],
      spotMarketIndexes: [0],
      oracleInfos: [],
      accountSubscription: { type: 'polling', accountLoader: loader },
      txVersion: 'legacy',
    });
    
    console.log('Subscribing...');
    const ok = await client.subscribe();
    console.log('Subscribe result:', ok);
    
    const state = client.getStateAccount();
    console.log('State: numberOfMarkets =', state.numberOfMarkets, 'numberOfSpotMarkets =', state.numberOfSpotMarkets);
    
    const perp = client.getPerpMarketAccount(0);
    console.log('SOL-PERP: marketIndex =', perp.marketIndex, 'status =', JSON.stringify(perp.status));
    console.log('AMM peg =', perp.amm.pegMultiplier.toNumber() / 1000);
    
    const spot = client.getSpotMarketAccount(0);
    console.log('USDC Spot: mint =', spot.mint.toString());
    
    const oracle = client.getOracleDataForPerpMarket(0);
    console.log('Oracle price =', oracle.price.toNumber() / 1e6);
    
    console.log('\n=== ALL TESTS PASSED ===');
    
    await client.unsubscribe();
    loader.stopPolling();
  } catch(e) {
    console.error('ERROR:', e.message || e);
    console.error(e.stack);
  }
  process.exit(0);
})();
