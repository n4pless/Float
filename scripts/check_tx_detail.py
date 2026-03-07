#!/usr/bin/env python3
import json, urllib.request, sys

url = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/'
admin = 'DXosop8DZbV7VU6ZxQitnDs7GBR4D5Nktw2uqSduNd5G'

# Get recent signature
payload = json.dumps({
    'jsonrpc': '2.0', 'id': 1,
    'method': 'getSignaturesForAddress',
    'params': [admin, {'limit': 1}]
}).encode()
req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req, timeout=15)
data = json.loads(resp.read())
sig = data['result'][0]['signature']
print(f'Latest signature: {sig}')
print(f'Slot: {data["result"][0]["slot"]}')
print(f'BlockTime: {data["result"][0]["blockTime"]}')

# Get transaction details
payload2 = json.dumps({
    'jsonrpc': '2.0', 'id': 2,
    'method': 'getTransaction',
    'params': [sig, {'encoding': 'jsonParsed', 'maxSupportedTransactionVersion': 0}]
}).encode()
req2 = urllib.request.Request(url, data=payload2, headers={'Content-Type': 'application/json'})
resp2 = urllib.request.urlopen(req2, timeout=15)
data2 = json.loads(resp2.read())
tx = data2.get('result', {})
if tx:
    meta = tx.get('meta', {})
    msg = tx.get('transaction', {}).get('message', {})
    accounts = msg.get('accountKeys', [])
    print(f'\nAccounts ({len(accounts)}):')
    for a in accounts[:5]:
        if isinstance(a, dict):
            print(f'  {a.get("pubkey", a)} (signer={a.get("signer")}, writable={a.get("writable")})')
        else:
            print(f'  {a}')
    
    instrs = msg.get('instructions', [])
    print(f'\nInstructions ({len(instrs)}):')
    for i, instr in enumerate(instrs):
        prog = instr.get('programId', instr.get('program', '?'))
        parsed = instr.get('parsed', {})
        if parsed:
            itype = parsed.get('type', '?')
            info = parsed.get('info', {})
            print(f'  [{i}] program={prog} type={itype}')
            if 'offset' in info:
                print(f'       offset={info["offset"]} bytes={info.get("bytes", "?")}')
            for k, v in info.items():
                if k not in ('offset', 'bytes', 'account'):
                    vstr = str(v)[:80]
                    print(f'       {k}={vstr}')
        else:
            print(f'  [{i}] program={prog} data_len={len(instr.get("data", ""))}')
    
    print(f'\nFee: {meta.get("fee", 0)} lamports')
    print(f'Log: {meta.get("logMessages", [])[:3]}')
else:
    print('No transaction data')
