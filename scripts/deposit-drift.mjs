/**
 * Deposit USDC into a Drift user account on our custom deployment
 * 
 * Usage: node scripts/deposit-drift.mjs <KEYPAIR_PATH> <USDC_AMOUNT>
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Wallet, DriftClient, BN, initialize } from '@drift-labs/sdk';
import fs from 'fs';

const DRIFT_PROGRAM_ID = process.env.DRIFT_PROGRAM_ID || 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const USDC_MINT = process.env.USDC_MINT || 'G1RCxqcc1DpLUnprWdxdZ9DsstmYmxhekZffJKNi5ths';
const RPC_URL = 'http://localhost:8899';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/deposit-drift.mjs <KEYPAIR_PATH> <USDC_AMOUNT>');
    process.exit(1);
  }

  const keypairPath = args[0];
  const usdcAmount = parseFloat(args[1]);

  // Load keypair
  const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(keypairPath, 'utf-8')));
  const keypair = Keypair.fromSecretKey(secretKey);
  const wallet = new Wallet(keypair);
  console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
  console.log(`Depositing ${usdcAmount} USDC into Drift account`);

  const connection = new Connection(RPC_URL, 'confirmed');

  // Initialize SDK with custom program
  const sdkConfig = initialize({
    env: 'devnet',
    overrideEnv: {
      DRIFT_PROGRAM_ID: DRIFT_PROGRAM_ID,
      USDC_MINT_ADDRESS: USDC_MINT,
    },
  });

  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new PublicKey(DRIFT_PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    activeSubAccountId: 0,
    subAccountIds: [0],
    txVersion: 'legacy',
  });

  await driftClient.subscribe();
  console.log('DriftClient subscribed');

  // Get USDC ATA
  const usdcMint = new PublicKey(USDC_MINT);
  const ata = await getAssociatedTokenAddress(usdcMint, wallet.publicKey);
  console.log(`USDC ATA: ${ata.toBase58()}`);

  // Check balance
  const balance = await connection.getTokenAccountBalance(ata);
  console.log(`USDC balance: ${balance.value.uiAmountString}`);

  // Deposit (USDC has 6 decimals)
  const amount = new BN(Math.floor(usdcAmount * 1e6));
  console.log(`Depositing ${amount.toString()} raw units (${usdcAmount} USDC)...`);
  
  const tx = await driftClient.deposit(
    amount,
    0, // USDC spot market index
    ata,
  );
  console.log(`Deposit tx: ${tx}`);
  console.log('Done! USDC deposited into Drift account.');

  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
