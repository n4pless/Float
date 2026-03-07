/**
 * Inspect the last trade transaction to understand why it filled against AMM
 * instead of the maker bot.
 */
const { Connection, PublicKey } = require('@solana/web3.js');

const RPC = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/';
const TX = '27wWoJ3fvxEA1fjJpJ9XUTQo7FndpUBKw9FeoF9ZfoxAAAGxzkaDfrC9PaMmmBhdfBpMqPvJeyqEYQ4m594TM5bb';

async function main() {
  const conn = new Connection(RPC, 'confirmed');
  const tx = await conn.getTransaction(TX, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    console.log('Transaction not found (may need more time for finalization)');
    process.exit(1);
  }

  console.log('=== Transaction Details ===');
  console.log('Slot:', tx.slot);
  console.log('Success:', tx.meta.err === null);
  console.log('Error:', tx.meta.err ? JSON.stringify(tx.meta.err) : 'none');
  console.log('Fee:', tx.meta.fee, 'lamports');

  console.log('\n=== Accounts ===');
  const msg = tx.transaction.message;
  const keys = msg.staticAccountKeys || msg.accountKeys;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].toBase58();
    const writable = tx.meta.loadedAddresses
      ? i < msg.header.numRequiredSignatures || i < (msg.header.numRequiredSignatures + msg.header.numReadonlySignedAccounts)
      : true;
    console.log(`  [${i}] ${key.slice(0,16)}... ${i === 0 ? '(SIGNER)' : ''}`);
  }

  console.log('\n=== Log Messages ===');
  if (tx.meta.logMessages) {
    for (const log of tx.meta.logMessages) {
      console.log(' ', log);
    }
  }

  // Look for events in the inner instructions
  console.log('\n=== Inner Instructions ===');
  if (tx.meta.innerInstructions) {
    for (const inner of tx.meta.innerInstructions) {
      console.log(`  Instruction ${inner.index}:`);
      for (const inst of inner.instructions) {
        console.log(`    programIdIndex=${inst.programIdIndex}, accounts=[${inst.accounts.join(',')}], data=${inst.data.slice(0,40)}...`);
      }
    }
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
