#!/usr/bin/env python3
import json, urllib.request

url = 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966'

# Check for buffer accounts owned by admin
payload = json.dumps({
    'jsonrpc': '2.0', 'id': 1,
    'method': 'getProgramAccounts',
    'params': ['BPFLoaderUpgradeab1e11111111111111111111111', {
        'filters': [
            {'memcmp': {'offset': 5, 'bytes': 'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G'}},
            {'memcmp': {'offset': 0, 'bytes': '2'}}
        ],
        'encoding': 'base64',
        'dataSlice': {'offset': 0, 'length': 0}
    }]
}).encode()

req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req, timeout=20)
    data = json.loads(resp.read())
    if 'result' in data:
        for acct in data['result']:
            pk = acct['pubkey']
            print(f'Buffer: {pk}')
            # Get account info to see data length
            payload2 = json.dumps({
                'jsonrpc': '2.0', 'id': 2,
                'method': 'getAccountInfo',
                'params': [pk, {'encoding': 'base64', 'dataSlice': {'offset': 0, 'length': 0}}]
            }).encode()
            req2 = urllib.request.Request(url, data=payload2, headers={'Content-Type': 'application/json'})
            resp2 = urllib.request.urlopen(req2, timeout=20)
            data2 = json.loads(resp2.read())
            if data2.get('result', {}).get('value'):
                info = data2['result']['value']
                print(f'  Data Length: {info.get("data", ["",""])[0] if isinstance(info.get("data"), list) else "unknown"}')
                print(f'  Lamports: {info.get("lamports", 0)} ({info.get("lamports", 0) / 1e9:.4f} SOL)')
                print(f'  Rent Epoch: {info.get("rentEpoch", "unknown")}')
        if not data['result']:
            print('No buffer accounts found for admin wallet')
    elif 'error' in data:
        print(f'Error: {data["error"]}')
except Exception as e:
    print(f'Request failed: {e}')
