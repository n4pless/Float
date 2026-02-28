/**
 * Float Exchange — Standalone Faucet API Server
 *
 * Lightweight Express server that provides two endpoints:
 *   POST /api/airdrop-sol  — devnet SOL airdrop (max 2 SOL)
 *   POST /api/mint-usdc    — mint custom devnet USDC (admin authority)
 *
 * In production, nginx serves the static frontend (dist/) and proxies
 * /api/* requests to this server on port 3001.
 *
 * Usage:
 *   node server.mjs                           # default port 3001
 *   PORT=3001 node server.mjs                 # custom port
 */

import express from 'express';
import cors from 'cors';
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3001', 10);

// ─── Configuration ───────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966';
const USDC_MINT = new PublicKey(process.env.USDC_MINT || '4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn');
const ADMIN_KEYPAIR_PATH = process.env.ADMIN_KEYPAIR || resolve(__dirname, '../keys/admin-keypair.json');

// Load admin keypair once at startup
const adminRaw = JSON.parse(readFileSync(ADMIN_KEYPAIR_PATH, 'utf-8'));
const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(adminRaw));
const connection = new Connection(RPC_URL, 'confirmed');

console.log(`[faucet] RPC: ${RPC_URL}`);
console.log(`[faucet] Admin: ${adminKeypair.publicKey.toBase58()}`);
console.log(`[faucet] USDC Mint: ${USDC_MINT.toBase58()}`);

// ─── Express App ─────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'float-faucet', uptime: process.uptime() });
});

// POST /api/airdrop-sol — request devnet SOL airdrop
app.post('/api/airdrop-sol', async (req, res) => {
  try {
    const { publicKey, amount } = req.body;
    if (!publicKey) return res.status(400).json({ success: false, error: 'publicKey required' });

    const pubkey = new PublicKey(publicKey);
    const amt = Math.min(Number(amount) || 2, 2); // devnet caps at 2 SOL

    console.log(`[faucet] airdrop-sol: ${amt} SOL → ${pubkey.toBase58().slice(0, 8)}...`);
    const sig = await connection.requestAirdrop(pubkey, amt * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, 'confirmed');

    res.json({ success: true, signature: sig, amount: amt });
  } catch (err) {
    console.error('[faucet] airdrop-sol error:', err.message);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// POST /api/mint-usdc — mint custom devnet USDC
app.post('/api/mint-usdc', async (req, res) => {
  try {
    const { publicKey, amount } = req.body;
    if (!publicKey) return res.status(400).json({ success: false, error: 'publicKey required' });

    const recipient = new PublicKey(publicKey);
    const amt = Math.min(Number(amount) || 10000, 100000); // max 100K per mint

    console.log(`[faucet] mint-usdc: ${amt} USDC → ${recipient.toBase58().slice(0, 8)}...`);
    const ata = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, USDC_MINT, recipient);
    const sig = await mintTo(connection, adminKeypair, USDC_MINT, ata.address, adminKeypair, Math.floor(amt * 1e6));

    res.json({ success: true, signature: String(sig), amount: amt });
  } catch (err) {
    console.error('[faucet] mint-usdc error:', err.message);
    res.status(500).json({ success: false, error: err.message || String(err) });
  }
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[faucet] Listening on http://127.0.0.1:${PORT}`);
});
