/**
 * Drift Exchange Configuration
 */

const heliusKey = import.meta.env.VITE_HELIUS_API_KEY ?? '';
const rpcUrl = import.meta.env.VITE_RPC_URL
  || 'https://lb.drpc.live/solana-devnet/AtMVHn4QFk9clJLtW0FvKh3psGPzGhMR8Z3vtuZZzRRv';

export const DRIFT_CONFIG = {
  // Network
  rpc: rpcUrl,
  network: import.meta.env.VITE_NETWORK || 'devnet',
  
  // Program IDs
  driftProgram: import.meta.env.VITE_DRIFT_PROGRAM_ID || 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE',
  
  // Tokens  (USDC mint will be updated by init-drift-devnet.mjs)
  usdc: {
    mint: '4MEQENKXftyy3yaWKs7ip4ZWwfp79GV63y2teWoBnQRn',
    decimals: 6,
    symbol: 'USDC',
  },
  
  // Oracles  (Prelaunch oracle managed by our Drift program)
  solOracle: '8pb2q6teRzjpYM19sEQiAxfX4ynmZEpALyQiyWddaPpG',
  
  // Markets
  markets: {
    0: { symbol: 'SOL-PERP', index: 0, pair: 'SOL/USDC', baseAsset: 'SOL', binanceSymbol: 'SOLUSDT', ccSymbol: 'SOL', maxLev: 10 },
  } as Record<number, { symbol: string; index: number; pair: string; baseAsset: string; binanceSymbol: string; ccSymbol: string; maxLev: number }>,
  
  // Default leverage limits
  maxLeverage: 10,
  defaultLeverage: 2,
  
  // Fee structure
  fees: {
    makerFee: -0.0001, // Negative = rebate
    takerFee: 0.0005,
    liquidationFee: 0.025,
  },
};

// Type definitions for configuration
export type MarketConfig = typeof DRIFT_CONFIG.markets[0];
export type Config = typeof DRIFT_CONFIG;

export default DRIFT_CONFIG;
