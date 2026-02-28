/**
 * Widen AMM spread so maker bot orders can compete.
 * Uses Anchor directly to build and send instructions.
 */
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const anchor = require('@coral-xyz/anchor');
const { Wallet, initialize, OracleSource, PRICE_PRECISION } = require('@drift-labs/sdk');
const fs = require('fs');
const path = require('path');

const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const raw = JSON.parse(fs.readFileSync('/home/gorcore/Drift-Clone/keys/admin-keypair.json'));
  const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
  console.log('Admin:', kp.publicKey.toBase58());

  // Load IDL
  const idlPath = path.join(__dirname, '..', 'protocol-v2', 'target', 'idl', 'drift.json');
  const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

  // Setup Anchor provider & program
  const provider = new anchor.AnchorProvider(conn, new Wallet(kp), { commitment: 'confirmed' });
  const program = new anchor.Program(idl, PROGRAM_ID, provider);

  // Derive PDAs
  const [statePda] = await PublicKey.findProgramAddress(
    [Buffer.from('drift_state')],
    PROGRAM_ID
  );
  const [perpMarketPda] = await PublicKey.findProgramAddress(
    [Buffer.from('perp_market'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)],
    PROGRAM_ID
  );
  console.log('State PDA:', statePda.toBase58());
  console.log('Perp Market PDA:', perpMarketPda.toBase58());

  // Read current market state
  const marketBefore = await program.account.perpMarket.fetch(perpMarketPda);
  const ammBefore = marketBefore.amm;
  console.log('\n=== BEFORE ===');
  console.log(`baseSpread: ${ammBefore.baseSpread}`);
  console.log(`maxSpread: ${ammBefore.maxSpread}`);
  console.log(`longSpread: ${ammBefore.longSpread}`);
  console.log(`shortSpread: ${ammBefore.shortSpread}`);

  // Update baseSpread to 2500 (25 bps = 0.25%)
  const newBaseSpread = 2500;
  console.log(`\nUpdating baseSpread to ${newBaseSpread} (${newBaseSpread/10000}%)...`);
  try {
    const tx1 = await program.methods
      .updatePerpMarketBaseSpread(newBaseSpread)
      .accounts({
        admin: kp.publicKey,
        state: statePda,
        perpMarket: perpMarketPda,
      })
      .rpc();
    console.log(`baseSpread tx: ${tx1}`);
  } catch (e) {
    console.error('Failed to update baseSpread:', e.message);
    if (e.logs) e.logs.forEach(l => console.error('  ', l));
  }

  // Update maxSpread to 50000 (500 bps = 5%)  
  const newMaxSpread = 50000;
  console.log(`\nUpdating maxSpread to ${newMaxSpread} (${newMaxSpread/10000}%)...`);
  try {
    const tx2 = await program.methods
      .updatePerpMarketMaxSpread(newMaxSpread)
      .accounts({
        admin: kp.publicKey,
        state: statePda,
        perpMarket: perpMarketPda,
      })
      .rpc();
    console.log(`maxSpread tx: ${tx2}`);
  } catch (e) {
    console.error('Failed to update maxSpread:', e.message);
    if (e.logs) e.logs.forEach(l => console.error('  ', l));
  }

  // Verify
  await new Promise(r => setTimeout(r, 2000));
  const marketAfter = await program.account.perpMarket.fetch(perpMarketPda);
  const ammAfter = marketAfter.amm;
  console.log('\n=== AFTER ===');
  console.log(`baseSpread: ${ammAfter.baseSpread}`);
  console.log(`maxSpread: ${ammAfter.maxSpread}`);
  console.log(`longSpread: ${ammAfter.longSpread}`);
  console.log(`shortSpread: ${ammAfter.shortSpread}`);

  const oraclePrice = 79.0; // approximate
  const BID_ASK_SPREAD_PRECISION = 1000000;
  const estLongSpread = ammAfter.longSpread || newBaseSpread / 2;
  const newAskEst = oraclePrice * (1 + estLongSpread / BID_ASK_SPREAD_PRECISION);
  console.log(`\nEstimated AMM ask: ~$${newAskEst.toFixed(4)}`);
  console.log(`Maker's closest ask (0.2% of oracle): ~$${(oraclePrice * 1.002).toFixed(4)}`);

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
