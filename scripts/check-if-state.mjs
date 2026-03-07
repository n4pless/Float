/**
 * Check Insurance Fund on-chain state to diagnose the "half withdrawal" bug.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { BN, DriftClient, initialize, Wallet, getInsuranceFundStakeAccountPublicKey, unstakeSharesToAmount, BulkAccountLoader } from '@drift-labs/sdk';
import { Keypair } from '@solana/web3.js';
import fs from 'fs';

const RPC = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
  const wallet = new Wallet(kp);

  const accountLoader = new BulkAccountLoader(conn, 'confirmed', 5000);

  const driftClient = new DriftClient({
    connection: conn,
    wallet,
    programID: new PublicKey(PROGRAM_ID),
    env: 'devnet',
    accountSubscription: { type: 'polling', accountLoader },
  });

  await driftClient.subscribe();

  const spotMarket = driftClient.getSpotMarketAccount(0);
  if (!spotMarket) {
    console.log('No spot market found');
    return;
  }

  const ifData = spotMarket.insuranceFund;
  console.log('\n=== Insurance Fund On-Chain State ===');
  console.log('totalShares:        ', ifData.totalShares.toString());
  console.log('userShares:         ', ifData.userShares.toString());
  console.log('protocolShares:     ', ifData.totalShares.sub(ifData.userShares).toString());
  console.log('sharesBase:         ', ifData.sharesBase);
  console.log('unstakingPeriod:    ', ifData.unstakingPeriod.toString());
  console.log('revenueSettlePeriod:', ifData.revenueSettlePeriod.toString());
  console.log('totalFactor:        ', ifData.totalFactor);
  console.log('userFactor:         ', ifData.userFactor);

  // Get vault balance
  try {
    const vaultBal = await conn.getTokenAccountBalance(ifData.vault);
    console.log('\nvaultBalance (raw):  ', vaultBal.value.amount);
    console.log('vaultBalance (USDC): ', vaultBal.value.uiAmountString);
  } catch(e) {
    console.log('\nvaultBalance: ERROR -', e.message);
  }

  // Revenue pool
  console.log('\nrevenuePool scaledBalance:', spotMarket.revenuePool.scaledBalance.toString());

  // Check admin's IF stake account
  const stakeAccountPubkey = getInsuranceFundStakeAccountPublicKey(
    new PublicKey(PROGRAM_ID),
    kp.publicKey,
    0
  );
  console.log('\n=== Admin IF Stake Account ===');
  console.log('stakeAccountPDA:', stakeAccountPubkey.toBase58());

  const acctInfo = await conn.getAccountInfo(stakeAccountPubkey);
  if (!acctInfo) {
    console.log('No stake account found for admin');
  } else {
    try {
      const stakeAccount = driftClient.program.account.insuranceFundStake.coder.accounts.decode(
        'InsuranceFundStake', acctInfo.data
      );
      console.log('ifShares:                 ', stakeAccount.ifShares.toString());
      console.log('ifBase:                   ', stakeAccount.ifBase);
      console.log('lastWithdrawRequestShares:', stakeAccount.lastWithdrawRequestShares.toString());
      console.log('lastWithdrawRequestValue: ', stakeAccount.lastWithdrawRequestValue.toString());
      console.log('lastWithdrawRequestTs:    ', stakeAccount.lastWithdrawRequestTs.toString());
      console.log('costBasis:                ', stakeAccount.costBasis.toString());

      // Calculate value using unstakeSharesToAmount
      const vaultBal = await conn.getTokenAccountBalance(ifData.vault);
      const vaultBalanceBN = new BN(vaultBal.value.amount);
      const valueBN = unstakeSharesToAmount(
        stakeAccount.ifShares,
        ifData.totalShares,
        vaultBalanceBN
      );
      console.log('\ncalculated stakeValue (raw):  ', valueBN.toString());
      console.log('calculated stakeValue (USDC): ', valueBN.toNumber() / 1e6);
      console.log('costBasis (USDC):             ', stakeAccount.costBasis.toNumber() / 1e6);
      console.log('ratio (value/costBasis):       ', (valueBN.toNumber() / Math.max(stakeAccount.costBasis.toNumber(), 1)).toFixed(4));
    } catch(e) {
      console.log('Error decoding stake account:', e.message);
    }
  }

  await driftClient.unsubscribe();
}

main().catch(console.error);
