import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { AdminClient, Wallet, OracleSource, initialize, getMarketsAndOraclesForSubscription, getPrelaunchOraclePublicKey, BN, PRICE_PRECISION } from '@drift-labs/sdk';
import fs from 'fs';

const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';

async function main() {
  const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
  const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'))));
  const cfg = initialize({ env: 'devnet' });
  cfg.DRIFT_PROGRAM_ID = PROGRAM_ID;
  const oracle = getPrelaunchOraclePublicKey(new PublicKey(PROGRAM_ID), 0);
  const { perpMarketIndexes, spotMarketIndexes } = getMarketsAndOraclesForSubscription('devnet');
  const admin = new AdminClient({
    connection: conn, wallet: new Wallet(kp), programID: new PublicKey(PROGRAM_ID), env: 'devnet',
    accountSubscription: { type: 'websocket' }, perpMarketIndexes, spotMarketIndexes,
    oracleInfos: [{ publicKey: oracle, source: OracleSource.Prelaunch }], txVersion: 'legacy',
  });
  await admin.subscribe();
  await new Promise(r => setTimeout(r, 5000));
  
  let m = admin.getPerpMarketAccount(0);
  const rp = m.amm.quoteAssetReserve.mul(m.amm.pegMultiplier).div(m.amm.baseAssetReserve).toNumber() / 1e6;
  console.log('BEFORE:');
  console.log('  reservePrice:', rp.toFixed(4));
  console.log('  peg:', m.amm.pegMultiplier.toString());
  console.log('  sqrtK:', m.amm.sqrtK.toString());
  console.log('  baseReserve:', m.amm.baseAssetReserve.toString());
  console.log('  quoteReserve:', m.amm.quoteAssetReserve.toString());
  console.log('  baseAmountWithAmm:', m.amm.baseAssetAmountWithAmm.toString());
  console.log('  longSpread:', m.amm.longSpread, 'shortSpread:', m.amm.shortSpread);
  console.log('  lastOracleConfPct:', m.amm.lastOracleConfPct.toString());
  console.log('  markStd:', m.amm.markStd.toString());
  
  // Reset oracle TWAPs first
  console.log('\nResetting oracle TWAPs...');
  const oraclePrice = m.amm.historicalOracleData.lastOraclePrice;
  const priceBN = new BN(oraclePrice.toString());
  try {
    await admin.updatePrelaunchOracleParams(0, priceBN, new BN(1000).mul(PRICE_PRECISION));
    console.log('  Done');
  } catch(e) { console.log('  err:', e.message?.slice(0, 100)); }
  
  // Crank oracle to pick up reset TWAPs (confidence → ~0)
  console.log('Cranking oracle...');
  try {
    await admin.updatePrelaunchOracle(0);
    console.log('  Done');
  } catch(e) { console.log('  err:', e.message?.slice(0, 100)); }
  
  // Set price again (crank overwrites it with AMM mark TWAP)
  try { await admin.updatePrelaunchOracleParams(0, priceBN, new BN(1000).mul(PRICE_PRECISION)); } catch(e) {}
  
  // Recenter AMM
  console.log('Recentering AMM...');
  m = admin.getPerpMarketAccount(0);
  try {
    const tx = await admin.recenterPerpMarketAmm(0, m.amm.pegMultiplier, m.amm.sqrtK);
    console.log('  Recenter TX:', tx.slice(0, 16) + '...');
  } catch(e) { console.log('  err:', e.message?.slice(0, 150)); }
  
  // Now repeg to fix the peg
  console.log('Repegging to oracle price...');
  await new Promise(r => setTimeout(r, 3000));
  try { await admin.accountSubscriber.fetch(); } catch {}
  try {
    const pegTx = await admin.repegAmmCurve(priceBN, 0);
    console.log('  Repeg TX:', pegTx.slice(0, 16) + '...');
  } catch(e) { console.log('  err:', e.message?.slice(0, 150)); }
  
  // Check after
  await new Promise(r => setTimeout(r, 5000));
  await admin.fetchAccounts();
  m = admin.getPerpMarketAccount(0);
  const rpAfter = m.amm.quoteAssetReserve.mul(m.amm.pegMultiplier).div(m.amm.baseAssetReserve).toNumber() / 1e6;
  console.log('\nAFTER:');
  console.log('  reservePrice:', rpAfter.toFixed(4));
  console.log('  peg:', m.amm.pegMultiplier.toString());
  console.log('  sqrtK:', m.amm.sqrtK.toString());
  console.log('  baseReserve:', m.amm.baseAssetReserve.toString());
  console.log('  quoteReserve:', m.amm.quoteAssetReserve.toString());
  console.log('  baseAmountWithAmm:', m.amm.baseAssetAmountWithAmm.toString());
  console.log('  longSpread:', m.amm.longSpread, 'shortSpread:', m.amm.shortSpread);
  console.log('  lastOracleConfPct:', m.amm.lastOracleConfPct.toString());
  console.log('  markStd:', m.amm.markStd.toString());
  
  const oData = await conn.getAccountInfo(oracle);
  if (oData) {
    const d = oData.data;
    const off = 8;
    console.log('  oracle.price:', Number(d.readBigInt64LE(off)) / 1e6);
    console.log('  oracle.confidence:', Number(d.readBigUInt64LE(off + 16)) / 1e6);
  }
  
  await admin.unsubscribe();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
