import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AdminClient, Wallet, OracleSource, initialize, getMarketsAndOraclesForSubscription, getPrelaunchOraclePublicKey } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'))));
  const cfg = initialize({ env: 'devnet' });
  cfg.DRIFT_PROGRAM_ID = PROGRAM_ID;
  const oracle = getPrelaunchOraclePublicKey(new PublicKey(PROGRAM_ID), 0);
  const { perpMarketIndexes, spotMarketIndexes, oracleInfos } = getMarketsAndOraclesForSubscription('devnet');
  const admin = new AdminClient({
    connection: conn, wallet: new Wallet(kp), programID: new PublicKey(PROGRAM_ID), env: 'devnet',
    accountSubscription: { type: 'websocket' }, perpMarketIndexes, spotMarketIndexes,
    oracleInfos: [{ publicKey: oracle, source: OracleSource.Prelaunch }], txVersion: 'legacy',
  });
  await admin.subscribe();
  await new Promise(r => setTimeout(r, 5000));
  const m = admin.getPerpMarketAccount(0);
  console.log('curveUpdateIntensity:', m.amm.curveUpdateIntensity);
  console.log('longSpread:', m.amm.longSpread, 'shortSpread:', m.amm.shortSpread);
  console.log('baseSpread:', m.amm.baseSpread, 'maxSpread:', m.amm.maxSpread);
  console.log('lastOracleConfPct:', m.amm.lastOracleConfPct.toString());
  console.log('markStd:', m.amm.markStd.toString());
  console.log('oracleStd:', m.amm.oracleStd.toString());
  console.log('baseAssetAmountWithAmm:', m.amm.baseAssetAmountWithAmm.toString());
  console.log('marginRatioInitial:', m.marginRatioInitial);
  
  const reservePrice = m.amm.quoteAssetReserve.mul(m.amm.pegMultiplier).div(m.amm.baseAssetReserve).toNumber() / 1e6;
  console.log('reservePrice:', reservePrice.toFixed(4));
  
  const oData = await conn.getAccountInfo(oracle);
  if (oData) {
    const d = oData.data;
    const off = 8;
    console.log('oracle.price:', Number(d.readBigInt64LE(off)) / 1e6);
    console.log('oracle.confidence:', Number(d.readBigUInt64LE(off + 16)) / 1e6);
  }
  
  await admin.unsubscribe();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
