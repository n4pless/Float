/**
 * Resilient RPC Connection with automatic fallback.
 *
 * Primary: QuikNode devnet (fast, but rate-limited on free tier)
 * Fallback: Public Solana devnet RPC (slower, no rate limit)
 *
 * On a 429 "max usage reached" from the primary endpoint,
 * subsequent requests transparently fall back for a cooldown period.
 */
import { Connection } from '@solana/web3.js';
import DRIFT_CONFIG from '../config';

const PRIMARY_HTTP   = DRIFT_CONFIG.rpc;
const FALLBACK_HTTP  = 'https://api.devnet.solana.com';
const FALLBACK_WSS   = 'wss://api.devnet.solana.com';

/** How long (ms) to stay on the fallback after a 429 before retrying primary */
const COOLDOWN_MS = 30_000; // 30 seconds

let _rateLimitedUntil = 0;

/**
 * Custom fetch that intercepts 429 responses from the primary RPC
 * and retries against the public devnet fallback.
 */
async function fetchWithFallback(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;

  const isPrimaryUrl = url.includes('quiknode.pro');

  // If we're still in cooldown, redirect to fallback immediately
  if (isPrimaryUrl && now < _rateLimitedUntil) {
    const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
    return globalThis.fetch(fallbackUrl, init);
  }

  // Try the original request
  const resp = await globalThis.fetch(input, init);

  // On 429, activate cooldown and retry on fallback
  if (resp.status === 429 && isPrimaryUrl) {
    _rateLimitedUntil = now + COOLDOWN_MS;
    console.warn(
      `[RPC] 429 rate-limited on QuikNode — falling back to public devnet for ${COOLDOWN_MS / 1000}s`,
    );
    const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
    return globalThis.fetch(fallbackUrl, init);
  }

  return resp;
}

/**
 * Create a Connection with automatic 429 fallback.
 */
export function createResilientConnection(
  commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
): Connection {
  return new Connection(PRIMARY_HTTP, {
    commitment,
    wsEndpoint: FALLBACK_WSS, // WSS uses public devnet (free QuikNode WSS is unreliable)
    fetch: fetchWithFallback,
    confirmTransactionInitialTimeout: 60_000,
  });
}

/**
 * Get the primary RPC URL (for ConnectionProvider endpoint prop).
 */
export const rpcEndpoint = PRIMARY_HTTP;

/**
 * ConnectionProvider config — pass as the `config` prop.
 */
export const connectionProviderConfig = {
  commitment: 'confirmed' as const,
  wsEndpoint: FALLBACK_WSS,
  fetch: fetchWithFallback,
  confirmTransactionInitialTimeout: 60_000,
};
