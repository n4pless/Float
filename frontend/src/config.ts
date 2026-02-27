/**
 * Drift Exchange Configuration
 */

export const DRIFT_CONFIG = {
  // Network
  rpc: 'https://devnet.helius-rpc.com/?api-key=d251870d-cc90-4544-9a60-f786ebff3966',
  network: 'devnet',
  
  // Program IDs
  driftProgram: 'EvKyHhYjCgpu335GdKZtfRsfu4VoUyjHn3kF3wgA5eXE',
  
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
    0: { symbol: 'SOL-PERP', index: 0, pair: 'SOL/USDC' },
  },
  
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
