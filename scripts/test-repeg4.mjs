import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';

const conn = new Connection('http://127.0.0.1:8899', 'confirmed');
const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync('keys/admin-keypair.json','utf8'))));
const wallet = new Wallet(kp);
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');

const sdk = await import('@drift-labs/sdk');
const { AdminClient, BulkAccountLoader, OracleSource, initialize: sdkInit, PRICE_PRECISION, PEG_PRECISION, getPrelaunchOraclePublicKey } = sdk;

sdkInit({ env: 'devnet' });
const bl = new BulkAccountLoader(conn, 'confirmed', 1000);
const oracle = getPrelaunchOraclePublicKey(PROGRAM_ID, 0);

const ac = new AdminClient({
  connection: conn, wallet, programID: PROGRAM_ID, env: 'devnet',
  accountSubscription: { type: 'polling', accountLoader: bl },
  perpMarketIndexes: [0], spotMarketIndexes: [0],
  oracleInfos: [{ publicKey: oracle, source: OracleSource.Prelaunch }],
  txVersion: 'legacy',
});

await ac.subscribe();
await new Promise(r => setTimeout(r, 3000));
await ac.accountSubscriber.fetch();

let perp = ac.getPerpMarketAccount(0);
console.log('Before:');
console.log('  peg:', perp.amm.pegMultiplier.toString());
console.log('  baseReserve:', perp.amm.baseAssetReserve.toString());
console.log('  quoteReserve:', perp.amm.quoteAssetReserve.toString());

const oracleData = ac.getOracleDataForPerpMarket(0);
console.log('  oracle:', oracleData.price.toNumber() / 1e6);

const pegVal = perp.amm.pegMultiplier.toNumber() / PEG_PRECISION.toNumber();
const ratio = perp.amm.quoteAssetReserve.toNumber() / perp.amm.baseAssetReserve.toNumber();
console.log('  effective AMM price:', pegVal * ratio);

// Check available AMM methods
console.log('\nAdminClient AMM methods:',
  Object.getOwnPropertyNames(Object.getPrototypeOf(ac))
    .filter(m => m.toLowerCase().includes('amm') || m.toLowerCase().includes('move') || m.toLowerCase().includes('peg'))
    .join(', ')
);

// Reset oracle to $89
const tx0 = await ac.updatePrelaunchOracleParams(0, new BN(89000000), PRICE_PRECISION.mul(new BN(100000)));
console.log('\nOracle reset to $89:', tx0.slice(0, 12));

await ac.unsubscribe();
bl.stopPolling?.();
process.exit(0);
