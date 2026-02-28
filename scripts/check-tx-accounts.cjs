const { Connection, PublicKey } = require('@solana/web3.js');
const conn = new Connection('https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966', 'confirmed');

async function main() {
  const txSig = '649UcuJxnkKunpsqYmhNfsSNiHyurfVrdeUwoXvYWm6274Q8wJ3aHWqpXrY6uP5fNUeNPXgekL72Ujf2fsPoFryf';
  const tx = await conn.getTransaction(txSig, { maxSupportedTransactionVersion: 0 });
  
  const KNOWN = {
    'Fm4q9C7kzzEZkFk3ihzA1VVQJRE1LK8kMiZ99Y94mcd': 'TARGET_WALLET',
    '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U': 'MAKER_BOT',
    'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G': 'ADMIN',
    '66w2bgBMKTkqfU8AVCPbaY6f3b9SzD9JvHaZbUoFefhK': 'FILLER',
    'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE': 'DRIFT_PROGRAM',
    'EVCLDKxHxtmhc6kPpBZwH1JcNFhxpq4djFDd19YMsNoB': 'PERP_MARKET_0',
    '87Qoav8o4zqca6YzPiqucFD8defemigmFEzzMCKdC4Rx': 'STATE',
    '8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG': 'SOL_ORACLE',
    'GgvPmJRcHaNKwxC8XnvEoCcVeozWWVorh3fphtfCoMuX': 'TARGET_USER_PDA',
  };
  
  const keys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
  console.log('All accounts in TX:');
  keys.forEach((k, i) => {
    const addr = k.toBase58 ? k.toBase58() : k;
    const label = KNOWN[addr] || '';
    console.log(`  [${i}] ${addr} ${label ? '(' + label + ')' : ''}`);
  });
  
  // Check lookup tables too
  if (tx.transaction.message.addressTableLookups && tx.transaction.message.addressTableLookups.length > 0) {
    console.log('\nAddress table lookups present');
  }
  
  const makerFound = keys.some(k => {
    const addr = k.toBase58 ? k.toBase58() : k;
    return addr === '4uLthhrGZ8AcMt4By2doVhFLakDSMuBtUm6UwYWDAD3U';
  });
  console.log('\nMaker bot in TX accounts?', makerFound ? 'YES' : 'NO');
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
