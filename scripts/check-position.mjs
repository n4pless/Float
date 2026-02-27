import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, getMarketsAndOraclesForSubscription, BASE_PRECISION } from '@drift-labs/sdk';
import fs from 'fs';

const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/maker-keypair.json'))));
const w = new Wallet(kp);

const cfg = initialize({ env: 'devnet' });
cfg.DRIFT_PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';

const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');

const dc = new DriftClient({
  connection: conn,
  wallet: w,
  programID: new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE'),
  env: 'devnet',
  accountSubscription: { type: 'websocket' },
  perpMarketIndexes,
  spotMarketIndexes,
  oracleInfos,
});

await dc.subscribe();
await new Promise(r => setTimeout(r, 4000));

const u = dc.getUser();
const ps = u.getUserAccount().perpPositions;
const p = ps.find(x => x.marketIndex === 0 && !x.baseAssetAmount.isZero());
if (p) {
  const sol = p.baseAssetAmount.toNumber() / BASE_PRECISION.toNumber();
  console.log('Position:', sol > 0 ? 'LONG' : 'SHORT', Math.abs(sol).toFixed(4), 'SOL');
  console.log('Quote entry:', p.quoteEntryAmount.toString());
  console.log('Quote breakeven:', p.quoteBreakEvenAmount.toString());
} else {
  console.log('No position!');
}

const orders = u.getOpenOrders();
console.log('Open orders:', orders.length);

await dc.unsubscribe();
process.exit(0);
