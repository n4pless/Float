// Fix Insurance Fund Revenue Pipeline
// Problem: 
//   1. perpMarket contractTier = HighlySpeculative (max insurance = 0) → blocks configuration
//   2. perpMarket.insuranceClaim.maxRevenueWithdrawPerPeriod = 0 → blocks fee→IF flow
//   3. Revenue settles ONLY during settle_pnl, which must be called
// Solution:
//   1. Upgrade contract tier to B (1M max insurance)
//   2. Set maxRevenueWithdrawPerPeriod, quoteMaxInsurance, unrealizedMaxImbalance
//   3. Settle PnL to move fees from feePool → revenuePool
//   4. Settle revenue to insurance fund (revenuePool → IF vault)

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

// PDAs
const [statePda] = PublicKey.findProgramAddressSync([Buffer.from('drift_state')], programId);
const perpMarketIndex = 0;
const spotMarketIndex = 0;
const [perpPda] = PublicKey.findProgramAddressSync([Buffer.from('perp_market'), new BN(perpMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [spotPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [spotVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('spot_market_vault'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [ifVaultPda] = PublicKey.findProgramAddressSync([Buffer.from('insurance_fund_vault'), new BN(spotMarketIndex).toArrayLike(Buffer, 'le', 2)], programId);
const [driftSigner] = PublicKey.findProgramAddressSync([Buffer.from('drift_signer')], programId);

// Known user wallets that have traded
const userWallets = [
  kp.publicKey, // admin
  new PublicKey('4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U'), // maker
  new PublicKey('66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK'), // filler
];

function getUserPda(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('user'), authority.toBuffer(), new BN(0).toArrayLike(Buffer, 'le', 2)],
    programId
  )[0];
}

async function main() {
  // ═══ Step 1: Upgrade Contract Tier ═══
  console.log('=== Step 1: Upgrade Perp Market Contract Tier ===');
  const perpBefore = await program.account.perpMarket.fetch(perpPda);
  console.log('Current contractTier:', JSON.stringify(perpBefore.contractTier));
  console.log('Current maxRevenueWithdrawPerPeriod:', perpBefore.insuranceClaim.maxRevenueWithdrawPerPeriod.toString());

  // Upgrade to tier B (max 1,000,000 USDC insurance)
  const tx1 = await program.rpc.updatePerpMarketContractTier(
    { b: {} },  // ContractTier::B
    {
      accounts: {
        admin: wallet.publicKey,
        state: statePda,
        perpMarket: perpPda,
      },
    }
  );
  console.log('updatePerpMarketContractTier → B, tx:', tx1);

  // Verify tier upgrade
  const perpPost1 = await program.account.perpMarket.fetch(perpPda);
  console.log('New contractTier:', JSON.stringify(perpPost1.contractTier));

  // ═══ Step 2: Set Insurance Claim Parameters ═══
  console.log('\n=== Step 2: Set maxRevenueWithdrawPerPeriod ===');
  const QUOTE = new BN(1_000_000);
  const unrealizedMaxImbalance = QUOTE.mul(new BN(500_000));        // 500,000 USDC
  const maxRevenueWithdrawPerPeriod = QUOTE.mul(new BN(100_000));   // 100,000 USDC/period
  const quoteMaxInsurance = QUOTE.mul(new BN(1_000_000));           // 1,000,000 USDC max

  const tx2 = await program.rpc.updatePerpMarketMaxImbalances(
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
  console.log('updatePerpMarketMaxImbalances tx:', tx2);

  const perpPost2 = await program.account.perpMarket.fetch(perpPda);
  console.log('maxRevenueWithdrawPerPeriod:', perpPost2.insuranceClaim.maxRevenueWithdrawPerPeriod.toString(),
    '(' + (perpPost2.insuranceClaim.maxRevenueWithdrawPerPeriod / 1e6).toFixed(0) + ' USDC)');
  console.log('quoteMaxInsurance:', perpPost2.insuranceClaim.quoteMaxInsurance.toString(),
    '(' + (perpPost2.insuranceClaim.quoteMaxInsurance / 1e6).toFixed(0) + ' USDC)');
  console.log('unrealizedPnlMaxImbalance:', perpPost2.unrealizedPnlMaxImbalance.toString(),
    '(' + (perpPost2.unrealizedPnlMaxImbalance / 1e6).toFixed(0) + ' USDC)');

  // ═══ Step 3: Settle PnL (moves fees from AMM feePool → spot revenuePool) ═══
  console.log('\n=== Step 3: Settle PnL for users (triggers fee→revenue pool transfer) ===');
  
  const spotBefore = await program.account.spotMarket.fetch(spotPda);
  console.log('Revenue pool BEFORE:', spotBefore.revenuePool.scaledBalance.toString());

  for (const userAuth of userWallets) {
    const userPda = getUserPda(userAuth);
    try {
      // Check if user account exists
      const userAcct = await program.account.user.fetch(userPda);
      console.log(`\nSettling PnL for ${userAuth.toBase58().slice(0,8)}... (${userAcct.perpPositions.filter(p => !p.baseAssetAmount.isZero()).length} perp positions)`);
      
      // settlePnl - authority is the caller (permissionless keeper call)
      const tx3 = await program.rpc.settlePnl(
        perpMarketIndex,
        {
          accounts: {
            state: statePda,
            user: userPda,
            authority: wallet.publicKey,
            spotMarketVault: spotVaultPda,
          },
          remainingAccounts: [
            // perp market oracle
            { pubkey: perpPost2.amm.oracle, isWritable: false, isSigner: false },
            // perp market
            { pubkey: perpPda, isWritable: true, isSigner: false },
            // spot market (quote market)
            { pubkey: spotPda, isWritable: true, isSigner: false },
          ],
        }
      );
      console.log(`  settlePnl tx: ${tx3}`);
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('Account does not exist')) {
        console.log(`  Skipping ${userAuth.toBase58().slice(0,8)} — no user account`);
      } else {
        console.log(`  settlePnl failed for ${userAuth.toBase58().slice(0,8)}: ${msg.slice(0, 120)}`);
      }
    }
  }

  // Check revenue pool after settle_pnl
  const spotAfter = await program.account.spotMarket.fetch(spotPda);
  console.log('\nRevenue pool AFTER settles:', spotAfter.revenuePool.scaledBalance.toString());

  // ═══ Step 4: Settle Revenue to Insurance Fund ═══
  console.log('\n=== Step 4: Settle Revenue to Insurance Fund ===');
  const ifBalBefore = await conn.getTokenAccountBalance(ifVaultPda);
  console.log('IF Vault BEFORE:', ifBalBefore.value.uiAmountString, 'USDC');

  try {
    const tx4 = await program.rpc.settleRevenueToInsuranceFund(
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
    console.log('settleRevenueToInsuranceFund tx:', tx4);
    
    const ifBalAfter = await conn.getTokenAccountBalance(ifVaultPda);
    console.log('IF Vault AFTER:', ifBalAfter.value.uiAmountString, 'USDC');
    console.log('Revenue settled:', (parseFloat(ifBalAfter.value.uiAmountString) - parseFloat(ifBalBefore.value.uiAmountString)).toFixed(6), 'USDC');
  } catch (err) {
    console.log('settleRevenueToInsuranceFund failed:', (err?.message || err).toString().slice(0, 200));
    const spotFinal = await program.account.spotMarket.fetch(spotPda);
    console.log('Revenue pool balance:', spotFinal.revenuePool.scaledBalance.toString());
    if (spotFinal.revenuePool.scaledBalance.toString() === '0') {
      console.log('\nRevenue pool is still empty. This means settle_pnl did not move fees.');
      console.log('The fee→revenue transfer requires settle_pnl to be called AND net_revenue_since_last_funding > 0.');
    }
  }

  // ═══ Final Summary ═══
  console.log('\n=== Final State ===');
  const perpFinal = await program.account.perpMarket.fetch(perpPda);
  const spotFinal = await program.account.spotMarket.fetch(spotPda);
  const ifBalFinal = await conn.getTokenAccountBalance(ifVaultPda);
  console.log('Perp contractTier:', JSON.stringify(perpFinal.contractTier));
  console.log('maxRevenueWithdrawPerPeriod:', perpFinal.insuranceClaim.maxRevenueWithdrawPerPeriod.toString());
  console.log('amm.feePool.scaledBalance:', perpFinal.amm.feePool.scaledBalance.toString());
  console.log('amm.totalFee:', (perpFinal.amm.totalFee / 1e6).toFixed(2), 'USDC');
  console.log('amm.totalFeeWithdrawn:', (perpFinal.amm.totalFeeWithdrawn / 1e6).toFixed(2), 'USDC');
  console.log('amm.netRevenueSinceLastFunding:', perpFinal.amm.netRevenueSinceLastFunding.toString());
  console.log('Spot revenuePool:', spotFinal.revenuePool.scaledBalance.toString());
  console.log('IF Vault:', ifBalFinal.value.uiAmountString, 'USDC');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
