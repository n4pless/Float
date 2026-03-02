#!/usr/bin/env python3
import json, urllib.request

url = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966'
admin = 'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G'

# Get recent signatures for admin to see if transactions are landing
payload = json.dumps({
    'jsonrpc': '2.0', 'id': 1,
    'method': 'getSignaturesForAddress',
    'params': [admin, {'limit': 10}]
}).encode()

req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req, timeout=15)
    data = json.loads(resp.read())
    if 'result' in data:
        sigs = data['result']
        print(f'Found {len(sigs)} recent transactions')
        for s in sigs:
            slot = s.get('slot', '?')
            err = s.get('err')
            bt = s.get('blockTime', 0)
            sig = s.get('signature', '')[:20]
            status = 'OK' if err is None else f'ERR: {err}'
            print(f'  slot={slot} time={bt} status={status} sig={sig}...')
    elif 'error' in data:
        print(f'Error: {data["error"]}')
except Exception as e:
    print(f'Request failed: {e}')
