const http = require('http');
http.get('http://localhost:6969/l2?marketName=SOL-PERP', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const d = JSON.parse(data);
    console.log('=== BIDS (buy) ===');
    d.bids.slice(0,6).forEach(b => console.log('  $' + (b.price/1e6).toFixed(2) + ' x ' + (b.size/1e9).toFixed(3) + ' SOL'));
    console.log('=== ASKS (sell) ===');
    d.asks.slice(0,6).forEach(a => console.log('  $' + (a.price/1e6).toFixed(2) + ' x ' + (a.size/1e9).toFixed(3) + ' SOL'));
    const spread = ((d.asks[0].price - d.bids[0].price) / d.asks[0].price * 100).toFixed(2);
    console.log('\nOracle: ~$81.27');
    console.log('Best bid: $' + (d.bids[0].price/1e6).toFixed(2));
    console.log('Best ask: $' + (d.asks[0].price/1e6).toFixed(2));
    console.log('Spread: ' + spread + '%');
    console.log('Total bids: ' + d.bids.length);
    console.log('Total asks: ' + d.asks.length);
  });
});
