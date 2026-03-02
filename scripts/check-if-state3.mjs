/**
 * Check Insurance Fund on-chain state to diagnose the "half withdrawal" bug.
 * Uses public devnet RPC (no batch restrictions).
 */
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, DriftClient, Wallet, BulkAccountLoader, getInsuranceFundStakeAccountPublicKey, unstakeSharesToAmount } from '@drift-labs/sdk';
import fs from 'fs';

const RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE';
const KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
  const wallet = new Wallet(kp);
  console.log('Admin pubkey:', kp.publicKey.toBase58());

  const accountLoader = new BulkAccountLoader(conn, 'confirmed', 10000);

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
    console.log('No spot market 0 found');
    await driftClient.unsubscribe();
    return;
  }

  const ifData = spotMarket.insuranceFund;
  console.log('\n=== Insurance Fund On-Chain State ===');
  console.log('totalShares:          ', ifData.totalShares.toString());
  console.log('userShares:           ', ifData.userShares.toString());
  console.log('protocolShares:       ', ifData.totalShares.sub(ifData.userShares).toString());
  console.log('sharesBase:           ', ifData.sharesBase);
  console.log('unstakingPeriod:      ', ifData.unstakingPeriod.toString(), 'seconds');
  console.log('totalFactor:          ', ifData.totalFactor);
  console.log('userFactor:           ', ifData.userFactor);
  console.log('vault pubkey:         ', ifData.vault.toBase58());

  // Get vault balance
  let vaultBalanceBN = new BN(0);
  try {
    const vaultBal = await conn.getTokenAccountBalance(ifData.vault);
    vaultBalanceBN = new BN(vaultBal.value.amount);
    console.log('\nvaultBalance (raw):    ', vaultBal.value.amount);
    console.log('vaultBalance (USDC):   ', vaultBal.value.uiAmountString);
  } catch(e) {
    console.log('\nvaultBalance: ERROR -', e.message);
  }

  console.log('\nrevenuePool scaledBal: ', spotMarket.revenuePool.scaledBalance.toString());

  // Compute per-share value
  const totalSharesNum = Number(ifData.totalShares.toString());
  const vaultNum = Number(vaultBalanceBN.toString());
  if (totalSharesNum > 0) {
    console.log('\n--- Share Math ---');
    console.log('vaultBalance / totalShares =', (vaultNum / totalSharesNum).toFixed(6));
    console.log('This means 1 share = ', (vaultNum / totalSharesNum / 1e6).toFixed(6), 'USDC');
  }

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
      console.log('authority:                 ', stakeAccount.authority.toBase58());
      console.log('ifShares:                  ', stakeAccount.ifShares.toString());
      console.log('ifBase:                    ', stakeAccount.ifBase);
      console.log('lastWithdrawRequestShares: ', stakeAccount.lastWithdrawRequestShares.toString());
      console.log('lastWithdrawRequestValue:  ', stakeAccount.lastWithdrawRequestValue.toString());
      console.log('lastWithdrawRequestTs:     ', stakeAccount.lastWithdrawRequestTs.toString());
      console.log('costBasis:                 ', stakeAccount.costBasis.toString());
      console.log('costBasis (USDC):          ', stakeAccount.costBasis.toNumber() / 1e6);
      console.log('marketIndex:               ', stakeAccount.marketIndex);

      // Calculate value using SDK function
      if (ifData.totalShares.gt(new BN(0))) {
        const valueBN = unstakeSharesToAmount(
          stakeAccount.ifShares,
          ifData.totalShares,
          vaultBalanceBN
        );
        console.log('\ncalculated stakeValue (raw):  ', valueBN.toString());
        console.log('calculated stakeValue (USDC): ', (valueBN.toNumber() / 1e6).toFixed(6));
        console.log('costBasis (USDC):             ', (stakeAccount.costBasis.toNumber() / 1e6).toFixed(6));

        const ratio = valueBN.toNumber() / Math.max(stakeAccount.costBasis.toNumber(), 1);
        console.log('stakeValue / costBasis ratio:  ', ratio.toFixed(4));

        if (ratio < 0.95) {
          console.log('\n⚠️  DILUTION DETECTED!');
          console.log('User deposited', (stakeAccount.costBasis.toNumber() / 1e6).toFixed(2), 'USDC');
          console.log('Current share value is only', (valueBN.toNumber() / 1e6).toFixed(2), 'USDC');
          console.log('Protocol shares:', ifData.totalShares.sub(ifData.userShares).toString());
          console.log('Those protocol shares have', ((1 - ratio) * vaultNum / 1e6).toFixed(2), 'USDC allocated to them');
        }
      }
    } catch(e) {
      console.log('Error decoding:', e.message);
    }
  }

  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
