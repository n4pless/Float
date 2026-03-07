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

/* ── RPC call monitor ─────────────────────────────────── */
interface RpcStats {
  total: number;
  byMethod: Record<string, number>;
  byEndpoint: { primary: number; fallback: number };
  errors429: number;
  errors32615: number;
  startedAt: number;
}
const _stats: RpcStats = {
  total: 0,
  byMethod: {},
  byEndpoint: { primary: 0, fallback: 0 },
  errors429: 0,
  errors32615: 0,
  startedAt: Date.now(),
};

function extractMethod(init?: RequestInit): string {
  if (!init?.body) return 'unknown';
  try {
    const bodyStr = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as ArrayBuffer);
    const parsed = JSON.parse(bodyStr);
    if (Array.isArray(parsed)) return `batch(${parsed.length})[${parsed.map((r: any) => r.method).join(',')}]`;
    return parsed.method ?? 'unknown';
  } catch { return 'unknown'; }
}

function logRpc(method: string, endpoint: 'primary' | 'fallback', extra?: string) {
  _stats.total++;
  _stats.byMethod[method] = (_stats.byMethod[method] ?? 0) + 1;
  _stats.byEndpoint[endpoint]++;
  const elapsed = ((Date.now() - _stats.startedAt) / 1000).toFixed(1);
  const tag = endpoint === 'primary' ? '🟢 QN' : '🟡 PUB';
  console.log(
    `[RPC #${_stats.total}] ${tag} ${method}${extra ? ' ' + extra : ''} (${elapsed}s, ${_stats.byEndpoint.primary}qn/${_stats.byEndpoint.fallback}pub)`,
  );
}

/** Print a summary table of all RPC calls — call from browser console: rpcStats() */
function printStats() {
  const elapsed = ((Date.now() - _stats.startedAt) / 1000).toFixed(1);
  console.group(`[RPC Stats] ${_stats.total} calls in ${elapsed}s`);
  console.table(
    Object.entries(_stats.byMethod)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => ({ method, count })),
  );
  console.log(`Endpoints: QuikNode=${_stats.byEndpoint.primary}, PublicDevnet=${_stats.byEndpoint.fallback}`);
  console.log(`429 errors: ${_stats.errors429}, -32615 errors: ${_stats.errors32615}`);
  console.groupEnd();
  return _stats;
}

// Expose on window so you can type rpcStats() in the browser console
if (typeof window !== 'undefined') {
  (window as any).rpcStats = printStats;
}

/**
 * Custom fetch that intercepts 429 responses from the primary RPC
 * and routes bulk getMultipleAccounts calls to the public fallback
 * (QuikNode free tier limits getMultipleAccounts to 5 keys).
 */
async function fetchWithFallback(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  const method = extractMethod(init);

  const isPrimaryUrl = url.includes('quiknode.pro');

  // If we're still in cooldown, redirect to fallback immediately
  if (isPrimaryUrl && now < _rateLimitedUntil) {
    logRpc(method, 'fallback', '[cooldown]');
    const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
    return globalThis.fetch(fallbackUrl, init);
  }

  // Intercept getMultipleAccounts with >5 keys → route directly to public devnet
  // QuikNode discover plan limits this RPC method to 5 accounts per call
  if (isPrimaryUrl && init?.body) {
    try {
      const bodyStr = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body as ArrayBuffer);
      const parsed = JSON.parse(bodyStr);

      // Handle single request
      if (parsed.method === 'getMultipleAccounts' && Array.isArray(parsed.params?.[0]) && parsed.params[0].length > 5) {
        logRpc(method, 'fallback', `[bulk ${parsed.params[0].length} keys]`);
        const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
        return globalThis.fetch(fallbackUrl, init);
      }

      // Handle batch requests containing getMultipleAccounts with >5 keys
      if (Array.isArray(parsed)) {
        const hasBulk = parsed.some(
          (r: any) => r.method === 'getMultipleAccounts' && Array.isArray(r.params?.[0]) && r.params[0].length > 5,
        );
        if (hasBulk) {
          logRpc(method, 'fallback', '[batch has bulk getMultipleAccounts]');
          const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
          return globalThis.fetch(fallbackUrl, init);
        }
      }
    } catch {
      // Body parse failed — proceed normally
    }
  }

  // Log the call going to primary
  logRpc(method, isPrimaryUrl ? 'primary' : 'fallback');

  // Try the original request
  const resp = await globalThis.fetch(input, init);

  // On 429, activate cooldown and retry on fallback
  if (resp.status === 429 && isPrimaryUrl) {
    _rateLimitedUntil = now + COOLDOWN_MS;
    _stats.errors429++;
    console.warn(
      `[RPC] ⛔ 429 rate-limited on QuikNode — falling back to public devnet for ${COOLDOWN_MS / 1000}s`,
    );
    logRpc(method, 'fallback', '[429 retry]');
    const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
    return globalThis.fetch(fallbackUrl, init);
  }

  // Also catch JSON-RPC error -32615 (method limit exceeded) and retry on fallback
  if (isPrimaryUrl && resp.ok) {
    const cloned = resp.clone();
    try {
      const json = await cloned.json();
      const hasLimitError = json?.error?.code === -32615 ||
        (Array.isArray(json) && json.some((r: any) => r?.error?.code === -32615));
      if (hasLimitError) {
        _stats.errors32615++;
        console.warn('[RPC] ⛔ QuikNode method limit exceeded (-32615) — retrying on public devnet');
        logRpc(method, 'fallback', '[-32615 retry]');
        const fallbackUrl = url.replace(PRIMARY_HTTP, FALLBACK_HTTP);
        return globalThis.fetch(fallbackUrl, init);
      }
    } catch {
      // JSON parse failed — return original response
    }
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
