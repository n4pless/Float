/**
 * Seed the Drift USDC spot market vault with admin liquidity.
 *
 * On a fresh deployment the vault is empty, so withdrawals fail with
 * SpotMarketInsufficientDeposits.  This script has the admin wallet
 * create a Drift user account and deposit a large amount of USDC,
 * which fills the vault and enables user withdrawals.
 *
 * Reads network config from drift-config.json.
 *
 * Usage:
 *   node scripts/seed-vault.mjs [USDC_AMOUNT]   (default 1,000,000)
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import anchor from '@coral-xyz/anchor';
const { Wallet, BN } = anchor;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Read config dynamically
const _cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'drift-config.json'), 'utf-8'));
const RPC_URL = _cfg.rpcUrl || 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const DRIFT_PROGRAM_ID = new PublicKey(_cfg.driftProgramId || 'GY689C42c4jyktzBXCeqDm1WFRRgNiXggJsAW9M2xC2L');

function loadKeypair(fp) {
  return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(fp, 'utf-8'))));
}

async function main() {
  const amount = parseInt(process.argv[2]) || 1_000_000; // default 1M USDC

  console.log('\n=== Seeding Drift USDC Vault ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const adminKeypair = loadKeypair(path.join(ROOT, 'keys', 'admin-keypair.json'));
  const wallet = new Wallet(adminKeypair);
  console.log(`Admin: ${adminKeypair.publicKey}`);

  // Load config for USDC mint
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'drift-config.json'), 'utf-8'));
  const usdcMint = new PublicKey(config.usdcMint);
  console.log(`USDC Mint: ${usdcMint}`);

  // Ensure admin has SOL
  const balance = await connection.getBalance(adminKeypair.publicKey);
  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log('[..] Airdropping SOL to admin...');
    const sig = await connection.requestAirdrop(adminKeypair.publicKey, 10 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // Mint USDC to admin ATA
  console.log(`[..] Minting ${amount.toLocaleString()} USDC to admin...`);
  const adminAta = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, adminKeypair.publicKey);
  await mintTo(connection, adminKeypair, usdcMint, adminAta.address, adminKeypair, amount * 1e6);
  console.log(`[ok] Admin USDC ATA: ${adminAta.address}`);

  // Load Drift SDK
  console.log('[..] Loading Drift SDK...');
  const sdk = await import('@drift-labs/sdk');
  const { DriftClient, BulkAccountLoader, initialize: sdkInit } = sdk;
  sdkInit({ env: 'devnet' });

  const bulkLoader = new BulkAccountLoader(connection, 'confirmed', 1000);

  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: DRIFT_PROGRAM_ID,
    opts: { commitment: 'confirmed' },
    activeSubAccountId: 0,
    perpMarketIndexes: [0],
    spotMarketIndexes: [0],
    oracleInfos: [],
    accountSubscription: { type: 'polling', accountLoader: bulkLoader },
    txVersion: 'legacy',
  });

  await driftClient.subscribe();
  console.log('[ok] DriftClient subscribed');

  // Check if admin already has a Drift user account
  let needsInit = false;
  try {
    const userPda = await driftClient.getUserAccountPublicKey();
    const info = await connection.getAccountInfo(userPda);
    if (!info || info.data.length === 0) needsInit = true;
  } catch {
    needsInit = true;
  }

  if (needsInit) {
    console.log('[..] Creating admin Drift user account...');
    const [txSig] = await driftClient.initializeUserAccount(0, 'vault-seed');
    console.log(`[ok] Admin user account created: ${txSig}`);
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('[ok] Admin Drift user account already exists');
  }

  // Deposit USDC into Drift (fills the spot market vault)
  const amountBN = new BN(amount * 1e6);
  const userTokenAccount = getAssociatedTokenAddressSync(usdcMint, adminKeypair.publicKey);
  console.log(`[..] Depositing ${amount.toLocaleString()} USDC into Drift vault...`);
  const depositTx = await driftClient.deposit(amountBN, 0, userTokenAccount);
  console.log(`[ok] Deposit tx: ${depositTx}`);

  // Verify
  try {
    const spotMarket = driftClient.getSpotMarketAccount(0);
    const depositBal = spotMarket.depositBalance?.toString() || '?';
    const borrowBal = spotMarket.borrowBalance?.toString() || '?';
    console.log(`\n[ok] Spot market state:`);
    console.log(`     depositBalance: ${depositBal}`);
    console.log(`     borrowBalance:  ${borrowBal}`);
  } catch (e) {
    console.log('[warn] Could not read spot market state:', e.message);
  }

  console.log(`\n=== Vault seeded with ${amount.toLocaleString()} USDC ===\n`);

  bulkLoader.stopPolling?.();
  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
