import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Devnet faucet API plugin.
 * Adds POST endpoints the frontend can call to fund wallets
 * without any terminal commands:
 *   POST /api/airdrop-sol  { publicKey, amount? }  — devnet airdrop (max 2 SOL)
 *   POST /api/mint-usdc    { publicKey, amount? }  — mint custom USDC (admin authority)
 */
function driftFaucetPlugin(): Plugin {
  return {
    name: 'drift-faucet',
    configureServer(server) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/') || req.method !== 'POST') return next();

        // Collect request body
        let body = '';
        for await (const chunk of req) body += chunk;
        let data: any = {};
        try { data = JSON.parse(body); } catch { /* empty */ }

        const json = (status: number, obj: any) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        };

        try {
          if (req.url === '/api/airdrop-sol') {
            const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
            const conn = new Connection('https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/', 'confirmed');
            const pubkey = new PublicKey(data.publicKey);
            const amt = Math.min(data.amount || 2, 2); // devnet caps at 2 SOL
            const sig = await conn.requestAirdrop(pubkey, amt * LAMPORTS_PER_SOL);
            await conn.confirmTransaction(sig);
            json(200, { success: true, signature: sig, amount: amt });
          }
          else if (req.url === '/api/mint-usdc') {
            const { Connection, Keypair, PublicKey } = await import('@solana/web3.js');
            const { getOrCreateAssociatedTokenAccount, mintTo } = await import('@solana/spl-token');
            const adminPath = resolve(__dirname, '../keys/admin-keypair.json');
            const adminRaw = JSON.parse(readFileSync(adminPath, 'utf-8'));
            const admin = Keypair.fromSecretKey(Uint8Array.from(adminRaw));
            const conn = new Connection('https://purple-purple-field.solana-devnet.quiknode.pro/a1fdb633f366155c13687a7d55daba5836aede55/', 'confirmed');
            // USDC mint — updated by init-drift-devnet.mjs
            const usdcMint = new PublicKey('4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn');
            const recipient = new PublicKey(data.publicKey);
            const amt = Math.min(data.amount || 10000, 100000);
            const ata = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, recipient);
            const sig = await mintTo(conn, admin, usdcMint, ata.address, admin, Math.floor(amt * 1e6));
            json(200, { success: true, signature: String(sig), amount: amt });
          }
          else {
            next();
          }
        } catch (err: any) {
          console.error('[faucet]', req.url, err?.message);
          json(500, { success: false, error: err?.message || String(err) });
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        process: true,
      },
      protocolImports: true,
    }),
    driftFaucetPlugin(),
  ],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', 'three-stdlib'],
        },
      },
    },
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  optimizeDeps: {
    entries: ['index.html'],
    include: ['buffer', 'process', 'crypto-browserify', 'stream-browserify', 'util', 'events'],
  },
  resolve: {
    alias: {
      '@': '/src',
      buffer: 'buffer',
      process: 'process/browser',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      util: 'util',
      events: 'events',
    },
  },
});
