/**
 * Find ALL InsuranceFundStake accounts and analyze them.
 */
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN, DriftClient, Wallet, BulkAccountLoader, unstakeSharesToAmount } from '@drift-labs/sdk';
import fs from 'fs';

const RPC = 'https://api.devnet.solana.com';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
  const wallet = new Wallet(kp);

  const accountLoader = new BulkAccountLoader(conn, 'confirmed', 10000);
  const driftClient = new DriftClient({
    connection: conn,
    wallet,
    programID: PROGRAM_ID,
    env: 'devnet',
    accountSubscription: { type: 'polling', accountLoader },
  });
  await driftClient.subscribe();

  const spotMarket = driftClient.getSpotMarketAccount(0);
  const ifData = spotMarket.insuranceFund;
  
  // Get vault balance
  const vaultBal = await conn.getTokenAccountBalance(ifData.vault);
  const vaultBalanceBN = new BN(vaultBal.value.amount);
  console.log('IF vault balance:', vaultBal.value.uiAmountString, 'USDC');
  console.log('IF totalShares:', ifData.totalShares.toString());
  console.log('IF userShares:', ifData.userShares.toString());
  console.log('IF sharesBase:', typeof ifData.sharesBase === 'number' ? ifData.sharesBase : ifData.sharesBase.toString());

  // Scan ALL program accounts for InsuranceFundStake (size ~166 bytes typically)
  console.log('\nScanning all program accounts...');
  const allAccounts = await conn.getProgramAccounts(PROGRAM_ID);
  console.log(`Found ${allAccounts.length} total accounts`);

  let stakeCount = 0;
  for (const { pubkey, account } of allAccounts) {
    try {
      const decoded = driftClient.program.account.insuranceFundStake.coder.accounts.decode(
        'InsuranceFundStake', account.data
      );
      stakeCount++;
      
      const shares = decoded.ifShares;
      let value = new BN(0);
      if (ifData.totalShares.gt(new BN(0)) && shares.gt(new BN(0))) {
        value = unstakeSharesToAmount(shares, ifData.totalShares, vaultBalanceBN);
      }

      console.log(`\n=== IF Stake #${stakeCount}: ${pubkey.toBase58()} ===`);
      console.log('  authority:', decoded.authority.toBase58());
      console.log('  ifShares:', shares.toString());
      console.log('  ifBase:', decoded.ifBase);
      console.log('  costBasis (raw):', decoded.costBasis.toString());
      console.log('  costBasis (USDC):', (decoded.costBasis.toNumber() / 1e6).toFixed(2));
      console.log('  computed value (USDC):', (value.toNumber() / 1e6).toFixed(2));
      console.log('  value/costBasis ratio:', decoded.costBasis.gt(new BN(0)) ? (value.toNumber() / decoded.costBasis.toNumber()).toFixed(4) : 'N/A');
      console.log('  lastWithdrawRequestShares:', decoded.lastWithdrawRequestShares.toString());
      console.log('  lastWithdrawRequestValue:', decoded.lastWithdrawRequestValue.toString());
      console.log('  lastWithdrawRequestTs:', decoded.lastWithdrawRequestTs.toString());
      console.log('  marketIndex:', decoded.marketIndex);

      // Check sharesBase mismatch
      const globalSharesBase = typeof ifData.sharesBase === 'number' ? ifData.sharesBase : Number(ifData.sharesBase.toString());
      const accountIfBase = decoded.ifBase;
      if (globalSharesBase !== accountIfBase) {
        console.log('  ⚠️ SHARES BASE MISMATCH! global:', globalSharesBase, 'account:', accountIfBase);
        console.log('  Shares need rebasing by 10^(' + globalSharesBase + '-' + accountIfBase + ') = 10^' + (globalSharesBase - accountIfBase));
        const rebaseFactor = Math.pow(10, globalSharesBase - accountIfBase);
        const rebasedShares = new BN(Math.floor(shares.toNumber() * rebaseFactor));
        const rebasedValue = unstakeSharesToAmount(rebasedShares, ifData.totalShares, vaultBalanceBN);
        console.log('  Rebased ifShares:', rebasedShares.toString());
        console.log('  Rebased value (USDC):', (rebasedValue.toNumber() / 1e6).toFixed(2));
      }
    } catch(e) {
      // Not an InsuranceFundStake — skip
    }
  }

  console.log(`\nTotal IF stake accounts found: ${stakeCount}`);

  await driftClient.unsubscribe();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
