#!/usr/bin/env python3
"""Switch all Helius RPC URLs to public devnet in ecosystem.config.js and frontend .env"""
import os

BASE = os.path.expanduser('~/Drift-Clone')
OLD_HTTP = 'https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/'
OLD_WSS  = 'wss://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/'
NEW_HTTP = 'https://api.devnet.solana.com'
NEW_WSS  = 'wss://api.devnet.solana.com'

for rel in ['ecosystem.config.js', 'frontend/.env']:
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print(f'SKIP {rel} (not found)')
        continue
    with open(path, 'r') as f:
        text = f.read()
    text = text.replace(OLD_HTTP, NEW_HTTP).replace(OLD_WSS, NEW_WSS)
    with open(path, 'w') as f:
        f.write(text)
    print(f'FIXED {rel}')

print('Done')
