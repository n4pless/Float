import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const conn = new Connection('https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/', 'confirmed');
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./keys/admin-keypair.json','utf8'))));
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, {});
const programId = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const idl = JSON.parse(fs.readFileSync('./protocol-v2/target/idl/drift.json','utf8'));
const program = new anchor.Program(idl, programId, provider);

// State
const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('drift_state')], programId);
const state = await program.account.state.fetch(statePda);
console.log('=== STATE ===');
console.log('numberOfSpotMarkets:', state.numberOfSpotMarkets);
console.log('numberOfMarkets:', state.numberOfMarkets);

// Spot market 0 (USDC)
const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const spot = await program.account.spotMarket.fetch(spotPda);
console.log('\n=== SPOT MARKET 0 (USDC) ===');
console.log('totalIfFactor:', spot.totalIfFactor);
console.log('userIfFactor:', spot.userIfFactor);
console.log('IF unstakingPeriod:', spot.insuranceFund.unstakingPeriod.toString());
console.log('IF revenueSettlePeriod:', spot.insuranceFund.revenueSettlePeriod.toString());
console.log('IF totalShares:', spot.insuranceFund.totalShares.toString());
console.log('IF userShares:', spot.insuranceFund.userShares.toString());
console.log('IF sharesBase:', spot.insuranceFund.sharesBase.toString());
console.log('IF lastRevenueSettleTs:', spot.insuranceFund.lastRevenueSettleTs.toString());
console.log('revenuePool.scaledBalance:', spot.revenuePool.scaledBalance.toString());
console.log('spotFeePool.scaledBalance:', spot.spotFeePool.scaledBalance.toString());
console.log('cumulativeDepositInterest:', spot.cumulativeDepositInterest.toString());

// IF vault
const [ifVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('insurance_fund_vault'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const vaultBal = await conn.getTokenAccountBalance(ifVaultPda);
console.log('\nIF Vault balance:', vaultBal.value.uiAmountString, 'USDC');

// Spot vault
const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market_vault'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const spotVaultBal = await conn.getTokenAccountBalance(spotVaultPda);
console.log('Spot vault balance:', spotVaultBal.value.uiAmountString, 'USDC');

// Perp market 0 (SOL-PERP)
const [perpPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new anchor.BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const perp = await program.account.perpMarket.fetch(perpPda);
console.log('\n=== PERP MARKET 0 (SOL-PERP) ===');
console.log('amm.totalFee:', perp.amm.totalFee.toString());
console.log('amm.totalFeeMinusDistributions:', perp.amm.totalFeeMinusDistributions.toString());
console.log('amm.totalFeeWithdrawn:', perp.amm.totalFeeWithdrawn.toString());
console.log('amm.feePool.scaledBalance:', perp.amm.feePool.scaledBalance.toString());
console.log('insuranceClaim.revenueWithdrawSinceLastSettle:', perp.insuranceClaim.revenueWithdrawSinceLastSettle.toString());
console.log('insuranceClaim.maxRevenueWithdrawPerPeriod:', perp.insuranceClaim.maxRevenueWithdrawPerPeriod.toString());
console.log('insuranceClaim.lastRevenueWithdrawTs:', perp.insuranceClaim.lastRevenueWithdrawTs.toString());
console.log('insuranceClaim.quoteSettledInsurance:', perp.insuranceClaim.quoteSettledInsurance.toString());

// Check all perp markets
const numPerps = state.numberOfMarkets;
console.log('\n=== ALL PERP MARKET FEES ===');
for (let i = 0; i < numPerps; i++) {
  const [pPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new anchor.BN(i).toArrayLike(Buffer, 'le', 2)], programId);
  const p = await program.account.perpMarket.fetch(pPda);
  console.log(`Market ${i}: totalFee=${p.amm.totalFee.toString()}, feePool=${p.amm.feePool.scaledBalance.toString()}, totalFeeMinusDist=${p.amm.totalFeeMinusDistributions.toString()}`);
}
