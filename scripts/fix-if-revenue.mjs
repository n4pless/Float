// Fix Insurance Fund Revenue Pipeline
// Problem: perpMarket.insuranceClaim.maxRevenueWithdrawPerPeriod = 0, blocking fee → IF flow
// Solution: Set maxRevenueWithdrawPerPeriod, then settle revenue

import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const conn = new Connection(RPC, 'confirmed');
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./keys/admin-keypair.json','utf8'))));
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const programId = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const idl = JSON.parse(fs.readFileSync('./protocol-v2/target/idl/drift.json','utf8'));
const program = new anchor.Program(idl, programId, provider);

const BN = anchor.BN;

// PDAs
const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('drift_state')], programId);
const perpMarketIndex = 0;
const spotMarketIndex = 0;
const [perpPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new BN(perpMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market_vault'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [ifVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('insurance_fund_vault'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [driftSigner] = PublicKey.findProgramAddressSync([Buffer.from('drift_signer')], programId);

async function main() {
  console.log('=== Step 1: Configure Perp Market Insurance Claim ===');
  
  // Read current state
  const perpBefore = await program.account.perpMarket.fetch(perpPda);
  console.log('BEFORE:');
  console.log('  maxRevenueWithdrawPerPeriod:', perpBefore.insuranceClaim.maxRevenueWithdrawPerPeriod.toString());
  console.log('  quoteMaxInsurance:', perpBefore.insuranceClaim.quoteMaxInsurance.toString());
  console.log('  unrealizedMaxImbalance:', perpBefore.unrealizedPnlMaxImbalance.toString());
  
  // Set reasonable values (QUOTE_PRECISION = 10^6)
  // maxRevenueWithdrawPerPeriod: 10,000 USDC per period
  // quoteMaxInsurance: 100,000 USDC max insurance payout
  // unrealizedMaxImbalance: 50,000 USDC max PnL imbalance
  const QUOTE_PRECISION = new BN(1_000_000);
  const unrealizedMaxImbalance = QUOTE_PRECISION.mul(new BN(50_000));   // 50,000 USDC
  const maxRevenueWithdrawPerPeriod = QUOTE_PRECISION.mul(new BN(10_000)); // 10,000 USDC per period
  const quoteMaxInsurance = QUOTE_PRECISION.mul(new BN(100_000));       // 100,000 USDC

  const tx1 = await program.rpc.updatePerpMarketMaxImbalances(
    unrealizedMaxImbalance,
    maxRevenueWithdrawPerPeriod,
    quoteMaxInsurance,
    {
      accounts: {
        admin: wallet.publicKey,
        state: statePda,
        perpMarket: perpPda,
      },
    }
  );
  console.log('\nupdatePerpMarketMaxImbalances tx:', tx1);

  // Verify
  const perpAfter = await program.account.perpMarket.fetch(perpPda);
  console.log('\nAFTER:');
  console.log('  maxRevenueWithdrawPerPeriod:', perpAfter.insuranceClaim.maxRevenueWithdrawPerPeriod.toString());
  console.log('  quoteMaxInsurance:', perpAfter.insuranceClaim.quoteMaxInsurance.toString());
  console.log('  unrealizedMaxImbalance:', perpAfter.unrealizedPnlMaxImbalance.toString());

  // Step 2: Check spot market IF factors and revenue pool
  console.log('\n=== Step 2: Check Spot Market Config ===');
  const spot = await program.account.spotMarket.fetch(spotPda);
  console.log('IF totalFactor:', spot.insuranceFund.totalFactor);
  console.log('IF userFactor:', spot.insuranceFund.userFactor);
  console.log('IF revenueSettlePeriod:', spot.insuranceFund.revenueSettlePeriod.toString());
  console.log('revenuePool.scaledBalance:', spot.revenuePool.scaledBalance.toString());
  console.log('spotFeePool.scaledBalance:', spot.spotFeePool.scaledBalance.toString());

  // Step 3: Try to settle revenue to IF
  console.log('\n=== Step 3: Settle Revenue to Insurance Fund ===');
  
  // Check IF vault before
  const ifBalBefore = await conn.getTokenAccountBalance(ifVaultPda);
  console.log('IF Vault BEFORE:', ifBalBefore.value.uiAmountString, 'USDC');
  
  // The settle instruction needs: state, spotMarket, spotMarketVault, driftSigner, insuranceFundVault, tokenProgram
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  
  try {
    const tx2 = await program.rpc.settleRevenueToInsuranceFund(
      spotMarketIndex,
      {
        accounts: {
          state: statePda,
          spotMarket: spotPda,
          spotMarketVault: spotVaultPda,
          driftSigner: driftSigner,
          insuranceFundVault: ifVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
      }
    );
    console.log('settleRevenueToInsuranceFund tx:', tx2);
    
    // Check IF vault after
    const ifBalAfter = await conn.getTokenAccountBalance(ifVaultPda);
    console.log('IF Vault AFTER:', ifBalAfter.value.uiAmountString, 'USDC');
    console.log('Revenue settled:', (parseFloat(ifBalAfter.value.uiAmountString) - parseFloat(ifBalBefore.value.uiAmountString)).toFixed(6), 'USDC');
  } catch (err) {
    console.log('Settle failed:', err.message || err);
    
    // Re-check revenue pool - it may still be empty because fees are in perp feePool, not spot revenuePool
    const spotPost = await program.account.spotMarket.fetch(spotPda);
    console.log('\nPost-attempt revenue pool:', spotPost.revenuePool.scaledBalance.toString());
    console.log('This is expected if perp fees haven\'t been moved to the revenue pool yet.');
    console.log('The keeper bots (filler) move fees during settle_pnl operations.');
    console.log('We need to also check if the perp fee pool flows to revenue pool...');
  }

  // Step 4: Also check the perp fee pool flow
  console.log('\n=== Step 4: Perp Fee Pool Details ===');
  const perpFinal = await program.account.perpMarket.fetch(perpPda);
  console.log('amm.totalFee:', perpFinal.amm.totalFee.toString(), '(' + (perpFinal.amm.totalFee / 1e6).toFixed(2) + ' USDC)');
  console.log('amm.totalFeeMinusDistributions:', perpFinal.amm.totalFeeMinusDistributions.toString(), '(' + (perpFinal.amm.totalFeeMinusDistributions / 1e6).toFixed(2) + ' USDC)');
  console.log('amm.totalFeeWithdrawn:', perpFinal.amm.totalFeeWithdrawn.toString(), '(' + (perpFinal.amm.totalFeeWithdrawn / 1e6).toFixed(2) + ' USDC)');
  console.log('amm.feePool.scaledBalance:', perpFinal.amm.feePool.scaledBalance.toString());
  console.log('insuranceClaim.revenueWithdrawSinceLastSettle:', perpFinal.insuranceClaim.revenueWithdrawSinceLastSettle.toString());
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
