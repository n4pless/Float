// Settle PnL and Revenue to Insurance Fund using proper Drift SDK
// Usage: node scripts/settle-pnl-and-if.mjs
// This script properly constructs all remaining accounts via DriftClient

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet, BN } from '@coral-xyz/anchor';
import {
  DriftClient,
  initialize,
  getMarketsAndOraclesForSubscription,
  BulkAccountLoader,
  QUOTE_PRECISION,
} from '@drift-labs/sdk';
import fs from 'fs';

const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');

const conn = new Connection(RPC, 'confirmed');
const kp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('./keys/admin-keypair.json', 'utf8')))
);
const wallet = new Wallet(kp);

async function main() {
  console.log('Initializing Drift SDK...');

  const sdkConfig = initialize({ env: 'devnet' });

  // Override program ID for our fork
  const bulkAccountLoader = new BulkAccountLoader(conn, 'confirmed', 5000);

  const driftClient = new DriftClient({
    connection: conn,
    wallet: wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: {
      type: 'polling',
      accountLoader: bulkAccountLoader,
    },
    activeSubAccountId: 0,
    subAccountIds: [0],
  });

  await driftClient.subscribe();
  console.log('DriftClient subscribed.');

  // Check perp market state
  const perpMarket = driftClient.getPerpMarketAccount(0);
  if (!perpMarket) {
    console.error('Perp market 0 not found!');
    return;
  }
  
  console.log('\n=== Perp Market 0 State ===');
  console.log('contractTier:', JSON.stringify(perpMarket.contractTier));
  console.log('maxRevWithdraw:', perpMarket.insuranceClaim.maxRevenueWithdrawPerPeriod.toString(),
    '(' + (perpMarket.insuranceClaim.maxRevenueWithdrawPerPeriod.toNumber() / 1e6).toFixed(0) + ' USDC)');
  console.log('netRevSinceLastFunding:', perpMarket.amm.netRevenueSinceLastFunding.toString(),
    '(' + (perpMarket.amm.netRevenueSinceLastFunding.toNumber() / 1e6).toFixed(2) + ' USDC)');
  console.log('feePool scaledBal:', perpMarket.amm.feePool.scaledBalance.toString());
  console.log('totalFee:', (perpMarket.amm.totalFee.toNumber() / 1e6).toFixed(2), 'USDC');
  console.log('totalFeeWithdrawn:', (perpMarket.amm.totalFeeWithdrawn.toNumber() / 1e6).toFixed(2), 'USDC');

  // Check spot market
  const spotMarket = driftClient.getSpotMarketAccount(0);
  console.log('\n=== Spot Market 0 (USDC) ===');
  console.log('revenuePool:', spotMarket.revenuePool.scaledBalance.toString());
  console.log('IF totalFactor:', spotMarket.insuranceFund.totalFactor);
  console.log('IF revenueSettlePeriod:', spotMarket.insuranceFund.revenueSettlePeriod.toString());
  console.log('IF lastRevenueSettleTs:', spotMarket.insuranceFund.lastRevenueSettleTs.toString());

  // Check IF vault balance
  const ifVaultPk = spotMarket.insuranceFund.vault;
  const ifBal = await conn.getTokenAccountBalance(ifVaultPk);
  console.log('IF vault balance:', ifBal.value.uiAmountString, 'USDC');

  // Step 1: Try to settle PnL for admin user
  console.log('\n=== Settling PnL ===');
  const user = driftClient.getUser();
  const userAccount = user.getUserAccount();
  const activePerpPositions = user.getActivePerpPositions();
  console.log('Active positions:', activePerpPositions.length);

  if (activePerpPositions.length > 0) {
    for (const pos of activePerpPositions) {
      console.log(`  Market ${pos.marketIndex}: baseAmount=${pos.baseAssetAmount.toString()}, quoteAmount=${pos.quoteAssetAmount.toString()}`);
      try {
        const tx = await driftClient.settlePNL(
          await driftClient.getUserAccountPublicKey(),
          userAccount,
          pos.marketIndex
        );
        console.log(`  Settled PnL for market ${pos.marketIndex}: tx=${tx}`);
      } catch (err) {
        const msg = err?.message || String(err);
        console.log(`  settlePnl failed for market ${pos.marketIndex}: ${msg.slice(0, 150)}`);
      }
    }
  } else {
    console.log('No active positions to settle.');
  }

  // Re-fetch spot market after settle
  await bulkAccountLoader.load();
  const spotAfter = driftClient.getSpotMarketAccount(0);
  console.log('\nRevenuePool after settlePnl:', spotAfter.revenuePool.scaledBalance.toString());

  // Step 2: Try to settle revenue to IF
  console.log('\n=== Settling Revenue to IF ===');
  if (spotAfter.revenuePool.scaledBalance.toString() !== '0') {
    try {
      const tx = await driftClient.settleRevenueToInsuranceFund(0);
      console.log('settleRevenueToIF tx:', tx);
      const ifBalAfter = await conn.getTokenAccountBalance(ifVaultPk);
      console.log('IF vault after:', ifBalAfter.value.uiAmountString, 'USDC');
    } catch (err) {
      console.log('settleRevenueToIF failed:', (err?.message || err).toString().slice(0, 200));
    }
  } else {
    console.log('Revenue pool is empty. Need positive netRevenueSinceLastFunding first.');
    const perpAfter = driftClient.getPerpMarketAccount(0);
    console.log('Current netRevSinceLastFunding:', 
      (perpAfter.amm.netRevenueSinceLastFunding.toNumber() / 1e6).toFixed(2), 'USDC');
    
    if (perpAfter.amm.netRevenueSinceLastFunding.toNumber() < 0) {
      console.log('\nThe AMM has negative net revenue since last funding update.');
      console.log('Revenue will flow after:');
      console.log('  1. Funding rate updates (resets counter) — happens every hour');
      console.log('  2. New trades generate fees that exceed PnL payouts');
      console.log('  3. settlePnl is called (filler bot does this)');
      console.log('  4. settleRevenueToIF is called (IF settler bot does this)');
    }
  }

  console.log('\n=== Done ===');
  await driftClient.unsubscribe();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
