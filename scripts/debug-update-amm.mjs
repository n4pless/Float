/**
 * Debug updateAMMs — check why it fails
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RPC_URL = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');

function loadKeypair(filePath) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(filePath, 'utf-8'))));
}

async function main() {
  const kp = loadKeypair(path.join(ROOT, 'keys', 'admin-keypair.json'));
  const conn = new Connection(RPC_URL, 'confirmed');
  const wallet = new Wallet(kp);

  const sdk = await import('@drift-labs/sdk');
  const { AdminClient, OracleSource, initialize: sdkInit, getPrelaunchOraclePublicKey } = sdk;
  sdkInit({ env: 'devnet' });

  const oracle = getPrelaunchOraclePublicKey(PROGRAM_ID, 0);

  const client = new AdminClient({
    connection: conn,
    wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [{ publicKey: oracle, source: OracleSource.Prelaunch }],
    txVersion: 'legacy',
  });

  await client.subscribe();
  console.log('[ok] Subscribed');

  // Check market state
  const market = client.getPerpMarketAccount(0);
  console.log('Market status:', market.status);
  console.log('AMM oracle:', market.amm.oracle.toString());
  console.log('AMM curveUpdateIntensity:', market.amm.curveUpdateIntensity);

  try {
    console.log('\n--- Attempting updateAMMs([0]) ---');
    const tx = await client.updateAMMs([0]);
    console.log('SUCCESS:', tx);
  } catch (err) {
    console.log('\n--- ERROR ---');
    console.log('Message:', err.message?.slice(0, 200));
    
    // Try to get simulation logs
    if (err.simulationResponse) {
      console.log('\nSimulation logs:');
      const logs = err.simulationResponse.logs || [];
      logs.forEach(l => console.log('  ', l));
    }
    if (err.logs) {
      console.log('\nTransaction logs:');
      err.logs.forEach(l => console.log('  ', l));
    }

    // Check for program error code
    if (err.code) console.log('Error code:', err.code);
    
    // Try manual IX build + simulate
    console.log('\n--- Trying manual simulate ---');
    try {
      const ix = await client.getUpdateAMMsIx([0]);
      const { Transaction } = await import('@solana/web3.js');
      const tx = new Transaction().add(ix);
      tx.feePayer = kp.publicKey;
      const bh = await conn.getLatestBlockhash();
      tx.recentBlockhash = bh.blockhash;
      const sim = await conn.simulateTransaction(tx);
      console.log('Sim err:', sim.value.err);
      console.log('Sim logs:');
      (sim.value.logs || []).forEach(l => console.log('  ', l));
    } catch (simErr) {
      console.log('Manual sim error:', simErr.message?.slice(0, 200));
    }
  }

  await client.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
