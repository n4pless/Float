// Force funding rate update + settle PnL + settle revenue to IF
// This resets netRevenueSinceLastFunding so revenue can flow

import anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const conn = new Connection(RPC, 'confirmed');
const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('./keys/admin-keypair.json','utf8'))));
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(conn, wallet, { commitment: 'confirmed' });
const programId = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const idl = JSON.parse(fs.readFileSync('./protocol-v2/target/idl/drift.json','utf8'));
const program = new anchor.Program(idl, programId, provider);

const BN = anchor.BN;
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('drift_state')], programId);
const [perpPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market'), new BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market_vault'), new BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const [ifVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('insurance_fund_vault'), new BN(0).toArrayLike(Buffer, 'le', 2)], programId);
const [driftSigner] = PublicKey.findProgramAddressSync([Buffer.from('drift_signer')], programId);

async function main() {
  const perp = await program.account.perpMarket.fetch(perpPda);
  console.log('netRevenueSinceLastFunding BEFORE:', perp.amm.netRevenueSinceLastFunding.toString(),
    '(' + (perp.amm.netRevenueSinceLastFunding / 1e6).toFixed(2) + ' USDC)');
  console.log('lastFundingRateTs:', perp.amm.lastFundingRateTs.toString());
  console.log('Oracle:', perp.amm.oracle.toBase58());

  // Step 1: Update funding rate
  console.log('\n=== Updating Funding Rate ===');
  try {
    const tx1 = await program.rpc.updateFundingRate(
      0, // market index
      {
        accounts: {
          state: statePda,
          perpMarket: perpPda,
          oracle: perp.amm.oracle,
        },
      }
    );
    console.log('updateFundingRate tx:', tx1);
  } catch (err) {
    console.log('updateFundingRate failed:', (err?.logs || [err?.message || err]).join('\n').slice(0, 300));
  }

  const perpAfter = await program.account.perpMarket.fetch(perpPda);
  console.log('netRevenueSinceLastFunding AFTER:', perpAfter.amm.netRevenueSinceLastFunding.toString(),
    '(' + (perpAfter.amm.netRevenueSinceLastFunding / 1e6).toFixed(2) + ' USDC)');

  // Step 2: Try settle PnL for admin user (who has a position)
  console.log('\n=== Settling PnL for Admin ===');
  const adminUserPda = PublicKey.findProgramAddressSync(
    [Buffer.from('user'), kp.publicKey.toBuffer(), new BN(0).toArrayLike(Buffer, 'le', 2)],
    programId
  )[0];

  try {
    const tx2 = await program.rpc.settlePnl(
      0, // market index
      {
        accounts: {
          state: statePda,
          user: adminUserPda,
          authority: wallet.publicKey,
          spotMarketVault: spotVaultPda,
        },
        remainingAccounts: [
          { pubkey: perpAfter.amm.oracle, isWritable: false, isSigner: false },
          { pubkey: perpPda, isWritable: true, isSigner: false },
          { pubkey: spotPda, isWritable: true, isSigner: false },
        ],
      }
    );
    console.log('settlePnl tx:', tx2);
  } catch (err) {
    const logs = err?.logs || [];
    console.log('settlePnl failed:');
    logs.forEach(l => console.log('  ', l));
    if (logs.length === 0) console.log('  ', err?.message?.slice(0, 200) || err);
  }

  // Check revenue pool
  const spotAfter = await program.account.spotMarket.fetch(spotPda);
  console.log('\nRevenuePool after settlePnl:', spotAfter.revenuePool.scaledBalance.toString());

  // Step 3: Try settle revenue to IF (if revenue pool has funds)
  if (spotAfter.revenuePool.scaledBalance.toString() !== '0') {
    console.log('\n=== Settling Revenue to IF ===');
    const ifBefore = await conn.getTokenAccountBalance(ifVaultPda);
    console.log('IF Vault before:', ifBefore.value.uiAmountString);

    const tx3 = await program.rpc.settleRevenueToInsuranceFund(
      0,
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
    console.log('settleRevenueToIF tx:', tx3);

    const ifAfter = await conn.getTokenAccountBalance(ifVaultPda);
    console.log('IF Vault after:', ifAfter.value.uiAmountString);
    console.log('Revenue added:', (parseFloat(ifAfter.value.uiAmountString) - parseFloat(ifBefore.value.uiAmountString)).toFixed(6), 'USDC');
  } else {
    console.log('\nRevenue pool still empty. Need trades to generate positive net revenue first.');
    console.log('Configuration is correct — revenue will flow automatically after:');
    console.log('  1. Funding rate update (resets netRevenue counter)');
    console.log('  2. New trades generate fees');
    console.log('  3. settlePnl is called (by keeper)');
    console.log('  4. settleRevenueToInsuranceFund is called (by keeper)');
  }

  // Final summary
  const perpFinal = await program.account.perpMarket.fetch(perpPda);
  const spotFinal = await program.account.spotMarket.fetch(spotPda);
  console.log('\n=== Final State ===');
  console.log('contractTier:', JSON.stringify(perpFinal.contractTier));
  console.log('maxRevenueWithdrawPerPeriod:', (perpFinal.insuranceClaim.maxRevenueWithdrawPerPeriod / 1e6).toFixed(0), 'USDC');
  console.log('netRevenueSinceLastFunding:', (perpFinal.amm.netRevenueSinceLastFunding / 1e6).toFixed(2), 'USDC');
  console.log('feePool:', (perpFinal.amm.feePool.scaledBalance / 1e10 * 1).toFixed(2), '(scaled)');
  console.log('revenuePool:', spotFinal.revenuePool.scaledBalance.toString());
  console.log('IF vault:', (await conn.getTokenAccountBalance(ifVaultPda)).value.uiAmountString, 'USDC');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
