/**
 * Fund a user wallet on devnet
 *
 * Airdrops SOL and mints USDC to a given wallet address so they can
 * trade on the devnet Drift deployment.
 *
 * Usage:
 *   node scripts/fund-user.mjs <WALLET_PUBKEY> [USDC_AMOUNT] [SOL_AMOUNT]
 *
 * Defaults: 10,000 USDC, 2 SOL
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Read RPC from drift-config.json
const driftConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'drift-config.json'), 'utf-8'));
const RPC_URL = driftConfig.rpcUrl || 'https://api.devnet.solana.com';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/fund-user.mjs <WALLET_PUBKEY> [USDC_AMOUNT] [SOL_AMOUNT]');
    console.error('  USDC_AMOUNT: default 10000');
    console.error('  SOL_AMOUNT:  default 2');
    process.exit(1);
  }

  const userPubkey = new PublicKey(args[0]);
  const usdcAmount = parseFloat(args[1] || '10000');
  const solAmount = parseFloat(args[2] || '2');

  console.log('\n' + '='.repeat(60));
  console.log('  FUND USER ON ' + (driftConfig.network || 'devnet').toUpperCase());
  console.log('='.repeat(60));
  console.log(`  User:   ${userPubkey.toString()}`);
  console.log(`  SOL:    ${solAmount}`);
  console.log(`  USDC:   ${usdcAmount}`);
  console.log('='.repeat(60) + '\n');

  // Connect
  const connection = new Connection(RPC_URL, 'confirmed');
  try {
    const ver = await connection.getVersion();
    console.log(`[ok] Connected to validator: Solana ${ver['solana-core']}`);
  } catch {
    console.error(`[!!] Cannot connect to ${RPC_URL}`);
    process.exit(1);
  }

  // Load admin keypair (mint authority for USDC)
  const adminPath = path.join(ROOT, 'keys', 'admin-keypair.json');
  const adminKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(adminPath, 'utf-8')))
  );
  console.log(`[ok] Admin: ${adminKeypair.publicKey.toString()}`);

  // Load config for USDC mint
  const configPath = path.join(ROOT, 'drift-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const usdcMint = new PublicKey(config.usdcMint);
  console.log(`[ok] USDC mint: ${usdcMint.toString()}`);

  // 1. Airdrop SOL to user
  console.log(`\n[..] Airdropping ${solAmount} SOL to user...`);
  try {
    const sig = await connection.requestAirdrop(
      userPubkey,
      Math.floor(solAmount * LAMPORTS_PER_SOL)
    );
    await connection.confirmTransaction(sig, 'confirmed');
    const bal = await connection.getBalance(userPubkey);
    console.log(`[ok] SOL airdrop confirmed. Balance: ${(bal / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (err) {
    console.error(`[!!] SOL airdrop failed: ${err.message}`);
  }

  // 2. Create USDC ATA for user and mint USDC
  console.log(`[..] Minting ${usdcAmount} USDC to user...`);
  try {
    const userAta = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,  // payer (admin pays for ATA creation)
      usdcMint,
      userPubkey,
    );
    console.log(`[ok] User USDC ATA: ${userAta.address.toString()}`);

    const mintAmount = BigInt(Math.floor(usdcAmount * 1e6)); // 6 decimals
    await mintTo(
      connection,
      adminKeypair,   // payer
      usdcMint,
      userAta.address,
      adminKeypair,   // mint authority
      mintAmount,
    );

    // Verify
    const info = await connection.getTokenAccountBalance(userAta.address);
    console.log(`[ok] USDC minted. Balance: ${info.value.uiAmountString} USDC`);
  } catch (err) {
    console.error(`[!!] USDC mint failed: ${err.message}`);
  }

  // Summary
  const finalSol = await connection.getBalance(userPubkey);
  console.log('\n' + '='.repeat(60));
  console.log('  USER FUNDED SUCCESSFULLY');
  console.log('='.repeat(60));
  console.log(`  Address: ${userPubkey.toString()}`);
  console.log(`  SOL:     ${(finalSol / LAMPORTS_PER_SOL).toFixed(4)}`);
  console.log(`  USDC:    ${usdcAmount}`);
  console.log('='.repeat(60) + '\n');

  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
