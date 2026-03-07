const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/', 'confirmed');

async function main() {
  const wallet = new PublicKey('Fm4q9C7kzzEZkFk3ihzA1VVQJRE1LK8kMiZ99Y94mcd');
  const sigs = await conn.getSignaturesForAddress(wallet, { limit: 3 });
  
  for (const sig of sigs) {
    console.log('\n========================================');
    console.log('TX:', sig.signature);
    console.log('Time:', new Date(sig.blockTime * 1000).toISOString());
    
    const tx = await conn.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
    if (tx && tx.meta && tx.meta.logMessages) {
      // Look for key account info
      const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
      if (accountKeys) {
        console.log('\nAccounts in TX:');
        accountKeys.forEach((k, i) => {
          const addr = k.toBase58 ? k.toBase58() : k;
          const labels = {
            'Fm4q9C7kzzEZkFk3ihzA1VVQJRE1LK8kMiZ99Y94mcd': 'TARGET_WALLET',
            '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U': 'MAKER_BOT',
            'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G': 'ADMIN',
            '66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK': 'FILLER',
            'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE': 'DRIFT_PROGRAM',
          };
          const label = labels[addr] || '';
          if (label) console.log(`  [${i}] ${addr} (${label})`);
        });
      }
      
      console.log('\nLogs:');
      tx.meta.logMessages.forEach(l => console.log(' ', l));
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
