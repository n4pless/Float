/**
 * Fund the Maker Bot's Drift account with USDC
 * 1. Mints USDC to the maker wallet (admin is mint authority)
 * 2. Deposits into the maker's Drift account as collateral
 *
 * Usage: node scripts/fund-maker.mjs [USDC_AMOUNT]
 * Default: 10000 USDC
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';
import { Wallet, DriftClient, BN } from '@drift-labs/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRIFT_PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const USDC_MINT_STR = '4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn';
const RPC_URL = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';

async function main() {
  const usdcAmount = parseFloat(process.argv[2] || '10000');
  
  // Load keypairs
  const adminRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../keys/admin-keypair.json'), 'utf-8'));
  const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminRaw));
  
  const makerRaw = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../keys/maker-keypair.json'), 'utf-8'));
  const makerKeypair = Keypair.fromSecretKey(Uint8Array.from(makerRaw));
  const makerWallet = new Wallet(makerKeypair);

  const connection = new Connection(RPC_URL, 'confirmed');
  const usdcMint = new PublicKey(USDC_MINT_STR);

  console.log(`Admin:  ${adminKeypair.publicKey.toBase58()}`);
  console.log(`Maker:  ${makerKeypair.publicKey.toBase58()}`);
  console.log(`Amount: ${usdcAmount} USDC`);

  // Step 1: Mint USDC to maker wallet
  console.log('\n[1/3] Minting USDC to maker wallet...');
  const ata = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, makerKeypair.publicKey);
  console.log(`       ATA: ${ata.address.toBase58()}`);

  const mintSig = await mintTo(connection, adminKeypair, usdcMint, ata.address, adminKeypair, Math.floor(usdcAmount * 1e6));
  console.log(`       Mint tx: ${mintSig}`);
  
  // Verify
  const ataInfo = await getAccount(connection, ata.address);
  console.log(`       USDC balance: ${Number(ataInfo.amount) / 1e6}`);

  // Step 2: Initialize DriftClient for maker
  console.log('\n[2/3] Connecting to Drift...');
  const driftClient = new DriftClient({
    connection,
    wallet: makerWallet,
    programID: new PublicKey(DRIFT_PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'websocket' },
    activeSubAccountId: 0,
    subAccountIds: [0],
    txVersion: 'legacy',
  });

  await driftClient.subscribe();
  console.log('       DriftClient subscribed');

  // Check if user exists, if not initialize
  try {
    const user = driftClient.getUser();
    console.log(`       Drift user exists: ${user.getUserAccountPublicKey().toBase58()}`);
  } catch (e) {
    console.log('       No Drift user found, initializing...');
    const [initTx] = await driftClient.initializeUserAccount(0);
    console.log(`       Init user tx: ${initTx}`);
  }

  // Step 3: Deposit USDC into Drift
  console.log('\n[3/3] Depositing USDC into Drift account...');
  const depositAmount = new BN(Math.floor(usdcAmount * 1e6));
  const depositTx = await driftClient.deposit(depositAmount, 0, ata.address);
  console.log(`       Deposit tx: ${depositTx}`);

  console.log(`\n✓ Maker funded with ${usdcAmount} USDC!`);
  
  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
