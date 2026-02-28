// Fix Insurance Fund Revenue Flow
// The fee pool has only ~36 USDC but needs >250 USDC (FEE_POOL_TO_REVENUE_POOL_THRESHOLD) 
// for automatic fee→revenue pool transfers.
// This script:
//   1. Deposits 500 USDC into the perp market fee pool (seeds it above 250 threshold)
//   2. Deposits 50 USDC directly into the revenue pool (immediate IF revenue)  
//   3. Settles revenue from revenue pool → insurance fund vault

import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import fs from 'fs';

const { BN } = anchor;

const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const USDC_MINT = new PublicKey('4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn');

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  
  // Load admin keypair
  const adminKp = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(fs.readFileSync('./keys/admin-keypair.json', 'utf8')))
  );
  console.log('Admin:', adminKp.publicKey.toBase58());

  // Set up Anchor
  const wallet = new anchor.Wallet(adminKp);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
  const idl = JSON.parse(fs.readFileSync('./protocol-v2/target/idl/drift.json', 'utf8'));
  const program = new anchor.Program(idl, PROGRAM_ID, provider);
  
  // PDAs
  const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('drift_state')], PROGRAM_ID);
  const [signerPda] = PublicKey.findProgramAddressSync([Buffer.from('drift_signer')], PROGRAM_ID);
  const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market'), new BN(0).toArrayLike(Buffer, 'le', 2)], PROGRAM_ID);
  const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market_vault'), new BN(0).toArrayLike(Buffer, 'le', 2)], PROGRAM_ID);
  const [ifVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('insurance_fund_vault'), new BN(0).toArrayLike(Buffer, 'le', 2)], PROGRAM_ID);
  const [perpPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new BN(0).toArrayLike(Buffer, 'le', 2)], PROGRAM_ID);
  
  // Admin's USDC ATA
  const adminAta = await getAssociatedTokenAddress(USDC_MINT, adminKp.publicKey);
  
  // Check initial balances
  const ifVaultBefore = await conn.getTokenAccountBalance(ifVaultPda);
  console.log('\n=== BEFORE ===');
  console.log('IF Vault balance:', ifVaultBefore.value.uiAmountString, 'USDC');
  
  const spot = await program.account.spotMarket.fetch(spotPda);
  console.log('Revenue Pool scaled balance:', spot.revenuePool.scaledBalance.toString());
  
  const perp = await program.account.perpMarket.fetch(perpPda);
  const feePoolBal = perp.amm.feePool.scaledBalance;
  const cumInt = BigInt(spot.cumulativeDepositInterest.toString());
  const precDec = BigInt(10) ** BigInt(19 - spot.decimals);
  const feePoolTokens = BigInt(feePoolBal.toString()) * cumInt / precDec;
  console.log('Fee Pool:', Number(feePoolTokens) / 1e6, 'USDC (need >250 for transfers)');
  console.log('totalExchangeFee:', Number(perp.amm.totalExchangeFee) / 1e6, 'USDC');
  console.log('totalFeeMinusDistributions:', Number(perp.amm.totalFeeMinusDistributions) / 1e6, 'USDC');

  // ========================================
  // STEP 1: Deposit 500 USDC into fee pool
  // ========================================
  console.log('\n--- Step 1: Deposit 500 USDC into perp market fee pool ---');
  const feePoolAmount = new BN(500_000_000); // 500 USDC (6 decimals)
  
  try {
    const tx1 = await program.methods
      .depositIntoPerpMarketFeePool(feePoolAmount)
      .accounts({
        state: statePda,
        perpMarket: perpPda,
        admin: adminKp.publicKey,
        sourceVault: adminAta,
        driftSigner: signerPda,
        quoteSpotMarket: spotPda,
        spotMarketVault: spotVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      ])
      .rpc();
    console.log('Fee pool deposit tx:', tx1);
    
    // Verify fee pool increased
    const perpAfter1 = await program.account.perpMarket.fetch(perpPda);
    const spotAfter1 = await program.account.spotMarket.fetch(spotPda);
    const cumInt1 = BigInt(spotAfter1.cumulativeDepositInterest.toString());
    const newFeePoolTokens = BigInt(perpAfter1.amm.feePool.scaledBalance.toString()) * cumInt1 / precDec;
    console.log('Fee Pool after deposit:', Number(newFeePoolTokens) / 1e6, 'USDC');
    console.log('totalFeeMinusDist after:', Number(perpAfter1.amm.totalFeeMinusDistributions) / 1e6, 'USDC');
  } catch (e) {
    console.error('Step 1 failed:', e.message);
    if (e.logs) e.logs.forEach(l => console.log('  ', l));
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // ========================================
  // STEP 2: Deposit 50 USDC into revenue pool (direct)
  // ========================================
  console.log('\n--- Step 2: Deposit 50 USDC directly into revenue pool ---');
  const revPoolAmount = new BN(50_000_000); // 50 USDC
  
  try {
    const tx2 = await program.methods
      .depositIntoSpotMarketRevenuePool(revPoolAmount)
      .accounts({
        state: statePda,
        spotMarket: spotPda,
        authority: adminKp.publicKey,
        spotMarketVault: spotVaultPda,
        userTokenAccount: adminAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .remainingAccounts([
        { pubkey: USDC_MINT, isSigner: false, isWritable: false },
      ])
      .rpc();
    console.log('Revenue pool deposit tx:', tx2);
    
    // Verify revenue pool increased
    const spotAfter2 = await program.account.spotMarket.fetch(spotPda);
    const cumInt2 = BigInt(spotAfter2.cumulativeDepositInterest.toString());
    const revTokens = BigInt(spotAfter2.revenuePool.scaledBalance.toString()) * cumInt2 / precDec;
    console.log('Revenue Pool after deposit:', Number(revTokens) / 1e6, 'USDC');
  } catch (e) {
    console.error('Step 2 failed:', e.message);
    if (e.logs) e.logs.forEach(l => console.log('  ', l));
  }

  // Wait a moment
  await new Promise(r => setTimeout(r, 2000));

  // ========================================
  // STEP 3: Settle revenue to IF vault
  // ========================================
  console.log('\n--- Step 3: Settle revenue to insurance fund ---');
  try {
    const tx3 = await program.methods
      .settleRevenueToInsuranceFund(0) // spot_market_index = 0
      .accounts({
        state: statePda,
        spotMarket: spotPda,
        spotMarketVault: spotVaultPda,
        driftSigner: signerPda,
        insuranceFundVault: ifVaultPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log('Settle revenue tx:', tx3);
  } catch (e) {
    console.error('Step 3 failed:', e.message);
    if (e.logs) e.logs.forEach(l => console.log('  ', l));
  }

  // Wait and check final balances
  await new Promise(r => setTimeout(r, 3000));

  // ========================================
  // VERIFICATION
  // ========================================
  console.log('\n=== AFTER ===');
  const ifVaultAfter = await conn.getTokenAccountBalance(ifVaultPda);
  console.log('IF Vault balance:', ifVaultAfter.value.uiAmountString, 'USDC');
  console.log('IF Vault change:', 
    (Number(ifVaultAfter.value.amount) - Number(ifVaultBefore.value.amount)) / 1e6, 'USDC');

  const spotFinal = await program.account.spotMarket.fetch(spotPda);
  const cumIntFinal = BigInt(spotFinal.cumulativeDepositInterest.toString());
  const revFinal = BigInt(spotFinal.revenuePool.scaledBalance.toString()) * cumIntFinal / precDec;
  console.log('Revenue Pool remaining:', Number(revFinal) / 1e6, 'USDC');
  console.log('Last revenue settle ts:', spotFinal.insuranceFund.lastRevenueSettleTs.toString());

  const perpFinal = await program.account.perpMarket.fetch(perpPda);
  const feePoolFinal = BigInt(perpFinal.amm.feePool.scaledBalance.toString()) * cumIntFinal / precDec;
  console.log('Fee Pool:', Number(feePoolFinal) / 1e6, 'USDC (>250 = automatic flow enabled)');

  if (Number(ifVaultAfter.value.amount) > Number(ifVaultBefore.value.amount)) {
    console.log('\n✅ SUCCESS! Insurance fund received revenue!');
  } else {
    console.log('\n⚠ Revenue pool may need more time to settle (revenue_settle_period check)');
    console.log('Revenue settle period:', spotFinal.insuranceFund.revenueSettlePeriod.toString(), 'seconds');
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
