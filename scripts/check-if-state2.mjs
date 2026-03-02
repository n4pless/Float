/**
 * Check Insurance Fund on-chain state — direct RPC queries, no SDK subscription needed.
 */
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { BN } from '@drift-labs/sdk';
import fs from 'fs';

const RPC = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const PROGRAM_ID = new PublicKey('EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE');
const KEYPAIR_PATH = '/home/gorcore/Drift-Clone/keys/admin-keypair.json';

// Anchor discriminator for SpotMarket = first 8 bytes of sha256("account:SpotMarket")
// We'll use getProgramAccounts with a filter for the specific market index instead.

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'))));
  console.log('Admin pubkey:', kp.publicKey.toBase58());

  // Get all program accounts and look for spot market / IF stake
  const allAccounts = await conn.getProgramAccounts(PROGRAM_ID, {
    commitment: 'confirmed',
  });
  console.log(`\nTotal program accounts: ${allAccounts.length}`);

  // Anchor discriminators (first 8 bytes of SHA256("account:<Name>"))
  // We'll check account sizes instead — SpotMarket is ~700-1000 bytes, InsuranceFundStake is ~120-200
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    const size = data.length;

    // SpotMarket accounts are typically large (700+ bytes)
    // InsuranceFundStake accounts are small (~166 bytes)

    // Try to identify by discriminator
    const disc = data.slice(0, 8).toString('hex');

    // Check for InsuranceFundStake accounts by size (typically 166 bytes)
    if (size >= 100 && size <= 200) {
      // Could be InsuranceFundStake — try to read fields
      // Layout: 8 (disc) + 32 (authority) + 1 (ifBaseOLD?) ...
      // Let's just print the raw hex for debugging
      console.log(`\nSmall account ${pubkey.toBase58()} (${size} bytes, disc: ${disc})`);

      // Using Anchor/Borsh layout:
      // InsuranceFundStake { authority, ifShares, lastWithdrawRequestShares, lastWithdrawRequestValue, lastWithdrawRequestTs, costBasis, ifBase, marketIndex }
      // disc(8), authority(32), ifShares(16 = u128 via BN), ...actually it's i64/u64 in borsh
      // Let me just print relevant bytes
      try {
        const authority = new PublicKey(data.slice(8, 40));
        console.log('  authority:', authority.toBase58());
        // ifShares is u128 at offset 40 (16 bytes, little-endian)
        const ifSharesLo = data.readBigUInt64LE(40);
        const ifSharesHi = data.readBigUInt64LE(48);
        const ifShares = ifSharesLo + (ifSharesHi << 64n);
        console.log('  ifShares (raw u128):', ifShares.toString());

        // Check if this account belongs to admin
        if (authority.equals(kp.publicKey)) {
          console.log('  ** THIS IS ADMIN STAKE ACCOUNT **');
        }
      } catch(e) {
        // skip
      }
    }
  }

  // Now use the seed derivation to find the admin's IF stake account directly
  const [stakeAccountPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('insurance_fund_stake'),
      kp.publicKey.toBuffer(),
      new BN(0).toArrayLike(Buffer, 'le', 2),  // u16 market index
    ],
    PROGRAM_ID
  );
  console.log('\n=== Admin IF Stake PDA ===');
  console.log('PDA:', stakeAccountPDA.toBase58());

  const stakeInfo = await conn.getAccountInfo(stakeAccountPDA);
  if (stakeInfo) {
    console.log('Account exists, size:', stakeInfo.data.length, 'bytes');
    const d = stakeInfo.data;
    // Print hex dump of first 120 bytes for analysis
    console.log('First 120 bytes hex:');
    for (let i = 0; i < Math.min(120, d.length); i += 16) {
      const slice = d.slice(i, Math.min(i+16, d.length));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`  ${i.toString().padStart(4)}: ${hex}`);
    }
  } else {
    console.log('No IF stake account for admin');
  }

  // Find the Drift State account
  const [statePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('drift_state')],
    PROGRAM_ID
  );
  console.log('\n=== Drift State ===');
  const stateInfo = await conn.getAccountInfo(statePDA);
  if (stateInfo) {
    console.log('State account size:', stateInfo.data.length, 'bytes');
    const sd = stateInfo.data;
    // numberOfSpotMarkets is at a certain offset — let's just check a few things
    // We'll look for the spot market account instead
  }

  // Find SpotMarket for index 0
  const [spotMarketPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('spot_market'), new BN(0).toArrayLike(Buffer, 'le', 2)],
    PROGRAM_ID
  );
  console.log('\n=== Spot Market 0 ===');
  const spotInfo = await conn.getAccountInfo(spotMarketPDA);
  if (spotInfo) {
    console.log('Account size:', spotInfo.data.length, 'bytes');
    // Print the full hex for analysis - look for IF fields
    console.log('All bytes hex dump:');
    const sd = spotInfo.data;
    for (let i = 0; i < sd.length; i += 32) {
      const slice = sd.slice(i, Math.min(i+32, sd.length));
      const hex = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`  ${i.toString().padStart(4)}: ${hex}`);
    }
  } else {
    console.log('No spot market found at expected PDA');
  }
}

main().catch(console.error);
